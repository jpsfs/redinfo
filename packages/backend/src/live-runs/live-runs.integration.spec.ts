import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  DEFAULT_DELEGATION_SETTINGS,
  EventLocationType,
  Gender,
  LIVE_RUN_RETENTION_HOURS,
  LiveRunInput,
  LiveRunState,
  UserRole,
  VictimDestinationKind,
  foldForSearch,
} from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { HolidaysService } from '../availability/holidays.service';
import { ShiftScheduleService } from '../availability/shift-schedule.service';
import { EventReportsService, RequestUser } from '../event-reports/event-reports.service';
import { EventReportNumbering } from '../event-reports/event-report-numbering';
import { StockMovementsService } from '../inventory/stock-movements.service';
import { IdentityCipher } from './identity-cipher';
import { IdentityPurgeService } from './identity-purge.service';
import { DelegationSettingsService } from './delegation-settings.service';
import { RouteDistanceService } from './route-distance.service';
import { LiveRunsService } from './live-runs.service';

/**
 * Integration coverage for live emergency runs (ADO #154/#162), against a real
 * Postgres.
 *
 * Skipped unless DATABASE_URL is set, and named so
 * `pnpm --filter backend test -- -t "integration"` selects it.
 *
 * What only a real database can answer, and is therefore here: that an
 * idempotent whole-document PUT leaves one row rather than two, that the bytes
 * in the `identity` column really do not contain the victim's name, that the
 * 48-hour gate closes, that the board's projection cannot load ciphertext, and
 * that every CHECK added by the migration refuses its own violation. The last of
 * those is the point of writing them: a constraint nobody has seen fire is a
 * comment.
 */
const describeIntegration = process.env.DATABASE_URL ? describe : describe.skip;

const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
const email = (local: string) => `${local}.${RUN}@live-runs.test`;

/** A name distinctive enough that finding it in a blob would be unambiguous. */
const VICTIM_NAME = `Maria Fernandes ${RUN}`;

const HOUR = 3600_000;

describeIntegration('Live runs (integration)', () => {
  const prisma = new PrismaClient() as unknown as PrismaService;

  let runs: LiveRunsService;
  let reports: EventReportsService;
  let purge: IdentityPurgeService;
  let cipher: IdentityCipher;

  let tiago: { id: string };
  let ana: { id: string };
  let outsider: { id: string };
  let coordinator: { id: string };

  let tiagoUser: RequestUser;
  let anaUser: RequestUser;
  let outsiderUser: RequestUser;
  let coordinatorUser: RequestUser;

  let municipality: { id: string };
  let taveiro: { id: string };
  let hospital: { id: string };
  let vehicle: { id: string };

  const createdRunIds: string[] = [];
  const createdReportIds: string[] = [];
  const createdMaterialItemIds: string[] = [];

  let sequence = 0;
  const nextRunId = () => {
    sequence += 1;
    const id = `run-${RUN}-${sequence}`;
    createdRunIds.push(id);
    return id;
  };

  const draft = (overrides: Partial<LiveRunInput> = {}): LiveRunInput => ({
    id: nextRunId(),
    revision: 1,
    state: LiveRunState.ON_SCENE,
    startedAt: '2024-08-22T20:11:00.000Z',
    externalReference: `2608 ${RUN.slice(0, 4)}`,
    chiefComplaint: 'Queda com traumatismo',
    locationType: EventLocationType.HOME,
    localityId: taveiro.id,
    victimGender: Gender.FEMALE,
    victimAge: 67,
    vehicleId: vehicle.id,
    crew: [{ userId: tiago.id, roleName: 'Driver' }],
    activationAt: '2024-08-22T20:14:00.000Z',
    sceneArrivalAt: '2024-08-22T20:26:00.000Z',
    identity: {
      victimName: VICTIM_NAME,
      victimSnsNumber: '123456789',
      occurrenceAddress: 'R. Dr. Manuel Rodrigues nº 12, 3º Esq.',
      referencePoints: 'porta azul ao lado do café',
    },
    capture: {
      notes: 'Consciente e orientada.',
      assessments: [{ takenAt: '2024-08-22T20:31:00.000Z', spo2: 97, systolic: 128, diastolic: 74 }],
    },
    ...overrides,
  });

  const createMaterialItem = async (namePt: string, type: 'COUNTABLE' | 'UNLIMITED' = 'COUNTABLE') => {
    const item = await prisma.materialItem.create({ data: { namePt: `${namePt} ${RUN}`, type: type as never } });
    createdMaterialItemIds.push(item.id);
    return item;
  };

  /** The raw bytes in the column, bypassing every serializer. */
  const rawIdentity = async (runId: string): Promise<Buffer | null> => {
    const rows = await prisma.$queryRaw<Array<{ identity: Buffer | null }>>`
      SELECT "identity" FROM "LiveRun" WHERE "id" = ${runId}
    `;
    return rows[0]?.identity ?? null;
  };

  beforeAll(async () => {
    const holidays = new HolidaysService(prisma);
    const shiftSchedule = new ShiftScheduleService(holidays, prisma);
    reports = new EventReportsService(prisma, shiftSchedule, new EventReportNumbering(), new StockMovementsService(prisma));

    // A key made here rather than read from the environment: the suite must not
    // depend on how the developer's `.env` happens to be set, and it must not be
    // able to write blobs the running service could later open.
    cipher = new IdentityCipher(`it-${RUN}:${randomBytes(32).toString('base64')}`);
    purge = new IdentityPurgeService(prisma);
    runs = new LiveRunsService(
      prisma,
      cipher,
      purge,
      reports,
      new DelegationSettingsService(prisma),
      // No key, so nothing reaches Google from a test run. A missing distance is
      // a warning in this design, never a block, so every close still succeeds.
      new RouteDistanceService(undefined),
    );

    const makeUser = (local: string, role: UserRole) =>
      prisma.user.create({
        data: {
          email: email(local),
          firstName: local[0].toUpperCase() + local.slice(1),
          lastName: 'Test',
          roles: [role],
          isActive: true,
        },
      });

    tiago = await makeUser('tiago', UserRole.EMERGENCY_OPERATIONAL);
    ana = await makeUser('ana', UserRole.EMERGENCY_OPERATIONAL);
    outsider = await makeUser('outsider', UserRole.EMERGENCY_OPERATIONAL);
    coordinator = await makeUser('coordinator', UserRole.EMERGENCY_COORDINATOR);

    tiagoUser = { id: tiago.id, roles: [UserRole.EMERGENCY_OPERATIONAL] };
    anaUser = { id: ana.id, roles: [UserRole.EMERGENCY_OPERATIONAL] };
    outsiderUser = { id: outsider.id, roles: [UserRole.EMERGENCY_OPERATIONAL] };
    coordinatorUser = { id: coordinator.id, roles: [UserRole.EMERGENCY_COORDINATOR] };

    municipality = await prisma.municipality.create({
      data: {
        ineCode: `LR-${RUN}`,
        name: `Campo ${RUN}`,
        district: `District ${RUN}`,
        latitude: 41.5923783,
        longitude: -8.6117829,
      },
    });
    taveiro = await prisma.locality.create({
      data: {
        name: 'Taveiro',
        searchName: foldForSearch('Taveiro'),
        municipalityId: municipality.id,
      },
    });
    hospital = await prisma.hospital.create({
      data: { name: `Hospital ${RUN}`, municipalityId: municipality.id },
    });
    vehicle = await prisma.vehicle.create({
      data: {
        licensePlate: `LR-${RUN}`,
        numeroCauda: `LR-${RUN}`,
        vehicleType: 'EMERGENCY',
        insuranceRenewalDate: new Date('2045-01-01T00:00:00.000Z'),
        nextImtInspectionDate: new Date('2045-01-01T00:00:00.000Z'),
      },
    });
  });

  afterAll(async () => {
    // Runs before reports: a run points at its report, and the FK is SetNull, so
    // the other order would leave rows behind for the next run to trip over.
    await prisma.liveRun.deleteMany({ where: { id: { in: createdRunIds } } });
    if (createdReportIds.length) {
      await prisma.eventReport.deleteMany({ where: { id: { in: createdReportIds } } });
    }
    // After the reports: a filed material line or a stock movement holds a
    // Restrict FK to its item, so the item can only go once nothing points at
    // it any more.
    if (createdMaterialItemIds.length) {
      await prisma.stockMovement.deleteMany({ where: { materialItemId: { in: createdMaterialItemIds } } });
      await prisma.materialItem.deleteMany({ where: { id: { in: createdMaterialItemIds } } });
    }
    await prisma.vehicle.deleteMany({ where: { id: vehicle?.id } });
    await prisma.hospital.deleteMany({ where: { name: { contains: RUN } } });
    await prisma.municipality.deleteMany({ where: { district: `District ${RUN}` } });
    await prisma.user.deleteMany({
      where: {
        id: {
          in: [tiago?.id, ana?.id, outsider?.id, coordinator?.id].filter(Boolean) as string[],
        },
      },
    });
    await prisma.$disconnect();
  });

  // ── Syncing ────────────────────────────────────────────────────────────────

  describe('the idempotent whole-document PUT', () => {
    it('creates the row the device named, so a run made offline lands in its own place', async () => {
      const input = draft();
      const { run, stale } = await runs.sync(input, tiagoUser);

      expect(stale).toBe(false);
      expect(run.id).toBe(input.id);
      expect(run.createdById).toBe(tiago.id);
      expect(run.crew.map((member) => member.userId)).toEqual([tiago.id]);
    });

    it('leaves one row when the same PUT arrives twice', async () => {
      const input = draft();
      await runs.sync(input, tiagoUser);
      await runs.sync(input, tiagoUser);

      // The whole point of the outbox: a phone can retry blindly on a bad
      // network without wondering whether the first attempt landed.
      await expect(prisma.liveRun.count({ where: { id: input.id } })).resolves.toBe(1);
    });

    it('replaces the crew wholesale rather than accumulating it', async () => {
      const input = draft();
      await runs.sync(input, tiagoUser);

      const { run } = await runs.sync(
        { ...input, revision: 2, crew: [{ userId: ana.id, roleName: 'Attendant' }] },
        tiagoUser,
      );

      expect(run.crew.map((member) => member.userId)).toEqual([ana.id]);
      await expect(
        prisma.liveRunCrewMember.count({ where: { runId: input.id } }),
      ).resolves.toBe(1);
    });

    it('answers a stale replay with the stored row, not an error', async () => {
      const input = draft();
      await runs.sync({ ...input, revision: 5, chiefComplaint: 'Dor torácica' }, tiagoUser);

      // A phone that has been in a cellar has an older document. That is normal
      // operation on a bad network, not something to put in front of a crew
      // mid-call — so it gets its own later state back rather than a 409.
      const { run, stale } = await runs.sync(
        { ...input, revision: 4, chiefComplaint: 'Something older' },
        tiagoUser,
      );

      expect(stale).toBe(true);
      expect(run.revision).toBe(5);
      expect(run.chiefComplaint).toBe('Dor torácica');
    });

    it('treats an equal revision as stale too, because the device counts up', async () => {
      const input = draft();
      await runs.sync({ ...input, revision: 3 }, tiagoUser);
      const { stale } = await runs.sync({ ...input, revision: 3 }, tiagoUser);
      expect(stale).toBe(true);
    });

    it('refuses to close through a sync', async () => {
      const input = draft();
      await runs.sync(input, tiagoUser);

      // Closing creates a report. It must not be able to happen as a side effect
      // of a queued PUT replaying on reconnect.
      await expect(
        runs.sync({ ...input, revision: 2, state: LiveRunState.CLOSED }, tiagoUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('names a missing reference rather than leaking a foreign-key error', async () => {
      await expect(
        runs.sync(draft({ localityId: 'loc-that-never-was' }), tiagoUser),
      ).rejects.toThrow(/locality/i);
      await expect(
        runs.sync(draft({ vehicleId: 'veh-that-never-was' }), tiagoUser),
      ).rejects.toThrow(/vehicle/i);
      await expect(
        runs.sync(draft({ crew: [{ userId: 'user-that-never-was' }] }), tiagoUser),
      ).rejects.toThrow(/crew/i);
    });
  });

  // ── Identity ───────────────────────────────────────────────────────────────

  describe('the identity column', () => {
    it('holds no plaintext at all', async () => {
      const input = draft();
      await runs.sync(input, tiagoUser);

      const blob = await rawIdentity(input.id);
      expect(blob).not.toBeNull();

      // Read raw, on purpose: the assertion that matters is about the bytes in
      // the column, not about what a serializer chose to return.
      const bytes = Buffer.from(blob!);
      const asText = bytes.toString('utf8');
      const asLatin = bytes.toString('latin1');
      for (const secret of [VICTIM_NAME, '123456789', 'Manuel Rodrigues', 'porta azul']) {
        expect(asText).not.toContain(secret);
        expect(asLatin).not.toContain(secret);
      }
    });

    it('comes back readable to the crew that recorded it', async () => {
      const input = draft();
      await runs.sync(input, tiagoUser);

      const read = await runs.findOne(input.id, tiagoUser);
      expect(read.identity?.victimName).toBe(VICTIM_NAME);
      expect(read.identityPurgedAt).toBeNull();
    });

    it('is bound to its own row, so a blob copied across refuses to open', async () => {
      const mine = draft();
      const theirs = draft();
      await runs.sync(mine, tiagoUser);
      await runs.sync(theirs, tiagoUser);

      // Rows here are keyed by *client-supplied* ids, so "copy row A's blob into
      // row B" is a reachable attack rather than a theoretical one. The AAD is
      // what makes it fail.
      const blob = await rawIdentity(mine.id);
      await prisma.$executeRaw`
        UPDATE "LiveRun" SET "identity" = ${blob} WHERE "id" = ${theirs.id}
      `;

      const read = await runs.findOne(theirs.id, tiagoUser);
      expect(read.identity).toBeNull();
      expect(read.identityUnavailable).toBe(true);
    });

    it('is destroyed the instant the report is filed', async () => {
      const input = draft();
      await runs.sync(input, tiagoUser);
      const { report } = await runs.close(input.id, tiagoUser);
      createdReportIds.push(report.id);

      // Still there while the report is a draft: the crew finishing it may still
      // need the address to pick a locality.
      expect(await rawIdentity(input.id)).not.toBeNull();

      await reports.submit(report.id, coordinatorUser);

      expect(await rawIdentity(input.id)).toBeNull();
      const read = await runs.findOne(input.id, tiagoUser);
      expect(read.identity).toBeNull();
      // "We never had it" and "we had it and it is gone" are different facts.
      expect(read.identityPurgedAt).not.toBeNull();
    });

    it('is never resurrected by a phone syncing after the purge', async () => {
      const input = draft();
      await runs.sync(input, tiagoUser);
      await purge.purge([input.id]);

      await runs.sync({ ...input, revision: 9 }, tiagoUser);

      // The promise made was that the name is gone. A late sync must not undo it.
      expect(await rawIdentity(input.id)).toBeNull();
    });

    it('is purged inline by a read past the retention window, not only by the sweep', async () => {
      const input = draft();
      await runs.sync(input, tiagoUser);
      await prisma.liveRun.update({
        where: { id: input.id },
        data: {
          state: LiveRunState.CLOSED as never,
          closedAt: new Date(Date.now() - 49 * HOUR),
        },
      });

      // Correctness must not depend on a timer: `loadRow` destroys it before
      // returning the row, and the read is refused anyway.
      await expect(runs.findOne(input.id, coordinatorUser)).rejects.toThrow(NotFoundException);
      expect(await rawIdentity(input.id)).toBeNull();
    });
  });

  // ── Who may read a run ─────────────────────────────────────────────────────

  describe('reading a run', () => {
    it('lets the crew, the creator and a coordinator in, and nobody else', async () => {
      const input = draft({ crew: [{ userId: ana.id }] });
      await runs.sync(input, tiagoUser);

      await expect(runs.findOne(input.id, tiagoUser)).resolves.toBeDefined(); // creator
      await expect(runs.findOne(input.id, anaUser)).resolves.toBeDefined(); // on the crew
      await expect(runs.findOne(input.id, coordinatorUser)).resolves.toBeDefined(); // oversight
      await expect(runs.findOne(input.id, outsiderUser)).rejects.toThrow(ForbiddenException);
    });

    it('closes to everyone once the retention window has, coordinators included', async () => {
      const input = draft();
      await runs.sync(input, tiagoUser);

      const closedAt = new Date(Date.now() - LIVE_RUN_RETENTION_HOURS * HOUR - 60_000);
      await prisma.liveRun.update({
        where: { id: input.id },
        data: { state: LiveRunState.CLOSED as never, closedAt },
      });

      // The time gate is first, for everyone, so no branch can skip it.
      await expect(runs.findOne(input.id, tiagoUser)).rejects.toThrow(NotFoundException);
      await expect(runs.findOne(input.id, coordinatorUser)).rejects.toThrow(NotFoundException);
    });

    it('is still open a minute before the window closes', async () => {
      const input = draft();
      await runs.sync(input, tiagoUser);
      await prisma.liveRun.update({
        where: { id: input.id },
        data: {
          state: LiveRunState.CLOSED as never,
          closedAt: new Date(Date.now() - (LIVE_RUN_RETENTION_HOURS * HOUR - 60_000)),
        },
      });

      await expect(runs.findOne(input.id, coordinatorUser)).resolves.toBeDefined();
    });

    it('gives a crew member their own runs and nobody else’s', async () => {
      const mine = draft({ crew: [{ userId: ana.id }] });
      const theirs = draft({ crew: [] });
      await runs.sync(mine, tiagoUser);
      await runs.sync(theirs, outsiderUser);

      const ids = (await runs.findMine(anaUser)).map((run) => run.id);
      expect(ids).toContain(mine.id);
      expect(ids).not.toContain(theirs.id);
    });
  });

  describe('writing a run', () => {
    it('is the crew’s alone — a coordinator may read the board, not edit a phone', async () => {
      const input = draft();
      await runs.sync(input, tiagoUser);

      // Editing a phone's local truth from a desk would break the revision
      // contract the whole sync rests on: the device's counter is the only
      // ordering the server trusts, and a desk has no counter.
      await expect(
        runs.sync({ ...input, revision: 2 }, coordinatorUser),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        runs.sync({ ...input, revision: 2 }, outsiderUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('is refused once the run has become a report', async () => {
      const input = draft();
      await runs.sync(input, tiagoUser);
      const { report } = await runs.close(input.id, tiagoUser);
      createdReportIds.push(report.id);

      await expect(runs.sync({ ...input, revision: 7 }, tiagoUser)).rejects.toThrow(
        /closed into a report/i,
      );
    });
  });

  // ── The board ──────────────────────────────────────────────────────────────

  describe('the coordinator’s board', () => {
    it('carries no identity, because the query never selects it', async () => {
      const input = draft();
      await runs.sync(input, tiagoUser);

      const board = await runs.board();
      const entry = board.find((row) => row.id === input.id);
      expect(entry).toBeDefined();

      // Not "identity is null" — the field is absent from the shape entirely, so
      // there is nothing for a future serializer to forget to strip.
      expect(JSON.stringify(entry)).not.toContain(VICTIM_NAME);
      expect(Object.keys(entry as object)).not.toContain('identity');
      expect(Object.keys(entry as object)).not.toContain('capture');
      // What oversight actually needs is there.
      expect(entry).toMatchObject({ chiefComplaint: 'Queda com traumatismo', victimAge: 67 });
      expect(entry?.crew.map((member) => member.userId)).toEqual([tiago.id]);
    });

    it('shows open runs only', async () => {
      const input = draft();
      await runs.sync(input, tiagoUser);
      const { report } = await runs.close(input.id, tiagoUser);
      createdReportIds.push(report.id);

      const board = await runs.board();
      expect(board.map((row) => row.id)).not.toContain(input.id);
    });
  });

  // ── Closing ────────────────────────────────────────────────────────────────

  describe('closing a run', () => {
    it('hands back a draft report the crew can finish', async () => {
      const input = draft();
      await runs.sync(input, tiagoUser);

      const { run, report } = await runs.close(input.id, tiagoUser);
      createdReportIds.push(report.id);

      expect(run.state).toBe(LiveRunState.CLOSED);
      expect(run.closedAt).not.toBeNull();
      expect(run.reportId).toBe(report.id);

      // A draft, not a filing: the number is a position in the year's sequence,
      // and it is claimed when the crew files it.
      expect(report.number).toBeNull();
      expect(report.submittedAt).toBeNull();
      expect(report.liveRunId).toBe(input.id);

      // Everything the crew already recorded is on it, so nobody retypes it.
      expect(report.crew.map((member) => member.userId)).toEqual([tiago.id]);
      expect(report.vehicles.map((entry) => entry.vehicleId)).toEqual([vehicle.id]);
      expect(report.assessments).toHaveLength(1);
      expect(report.assessments?.[0]).toMatchObject({ spo2: 97, systolic: 128 });
      expect(report.activationAt).toBe(input.activationAt);
    });

    it('infers the scene departure and the available time it never got', async () => {
      const input = draft();
      await runs.sync(input, tiagoUser);

      const { run, report } = await runs.close(input.id, tiagoUser);
      createdReportIds.push(report.id);

      // Stood down on scene: the crew did leave, and is available again — those
      // are facts whether or not anybody tapped a button. Nobody went to a
      // hospital, so that stamp stays empty.
      expect(run.sceneDepartureAt).not.toBeNull();
      expect(run.availableAt).not.toBeNull();
      expect(run.hospitalArrivalAt).toBeNull();
    });

    it('carries no identity onto the report', async () => {
      const input = draft();
      await runs.sync(input, tiagoUser);
      const { report } = await runs.close(input.id, tiagoUser);
      createdReportIds.push(report.id);

      const stored = await reports.findOne(report.id, coordinatorUser);
      const asText = JSON.stringify(stored);
      expect(asText).not.toContain(VICTIM_NAME);
      expect(asText).not.toContain('Manuel Rodrigues');
    });

    it('refuses to close a run that could not become a report', async () => {
      const input = draft({ externalReference: null, localityId: null });
      await runs.sync(input, tiagoUser);

      await expect(runs.close(input.id, tiagoUser)).rejects.toThrow(/NO_LOCALITY/);
      await expect(runs.close(input.id, tiagoUser)).rejects.toThrow(/NO_REFERENCE/);
      await expect(prisma.liveRun.count({ where: { id: input.id, closedAt: null } })).resolves.toBe(
        1,
      );
    });

    it('takes a hospital destination all the way onto the report', async () => {
      const input = draft({
        state: LiveRunState.AT_HOSPITAL,
        sceneDepartureAt: '2024-08-22T20:48:00.000Z',
        hospitalArrivalAt: '2024-08-22T21:14:00.000Z',
        destinationKind: VictimDestinationKind.HOSPITAL,
        destinationHospitalId: hospital.id,
      });
      await runs.sync(input, tiagoUser);

      const { report } = await runs.close(input.id, tiagoUser);
      createdReportIds.push(report.id);

      expect(report.victims[0]).toMatchObject({
        destinationKind: VictimDestinationKind.HOSPITAL,
        destinationHospitalId: hospital.id,
      });
    });

    it('carries what was tapped live onto the draft report, with no stock moved yet', async () => {
      const bandage = await createMaterialItem('Ligadura');
      const oxygen = await createMaterialItem('Oxigénio', 'UNLIMITED');

      const input = draft({
        capture: {
          notes: 'Consciente e orientada.',
          materials: [
            { materialItemId: bandage.id, quantity: 1, at: '2024-08-22T20:20:00.000Z' },
            { materialItemId: bandage.id, quantity: 1, at: '2024-08-22T20:25:00.000Z' },
            { materialItemId: oxygen.id, at: '2024-08-22T20:30:00.000Z' },
          ],
        },
      });
      await runs.sync(input, tiagoUser);

      const { report } = await runs.close(input.id, tiagoUser);
      createdReportIds.push(report.id);

      expect(report.materials).toHaveLength(2);
      expect(report.materials.find((line) => line.materialItemId === bandage.id)).toMatchObject({
        vehicleId: vehicle.id,
        quantity: 2,
      });
      expect(report.materials.find((line) => line.materialItemId === oxygen.id)).toMatchObject({
        vehicleId: vehicle.id,
        quantity: null,
      });

      // A draft's materials are logged, not consumed — stock only ever moves
      // for a filed report, and this one is never submitted.
      await expect(
        prisma.stockMovement.count({ where: { materialItemId: { in: [bandage.id, oxygen.id] } } }),
      ).resolves.toBe(0);
    });
  });

  // ── The sweep ──────────────────────────────────────────────────────────────

  describe('the purge sweep', () => {
    it('deletes a run whose window has closed', async () => {
      const input = draft();
      await runs.sync(input, tiagoUser);
      await prisma.liveRun.update({
        where: { id: input.id },
        data: {
          state: LiveRunState.CLOSED as never,
          closedAt: new Date(Date.now() - 49 * HOUR),
        },
      });

      await purge.sweep();

      await expect(prisma.liveRun.count({ where: { id: input.id } })).resolves.toBe(0);
    });

    it('force-closes an abandoned run rather than deleting it', async () => {
      const input = draft();
      await runs.sync(input, tiagoUser);
      // `updatedAt` is `@updatedAt`, so it has to be pushed back in raw SQL —
      // any Prisma write would stamp it to now again.
      await prisma.$executeRaw`
        UPDATE "LiveRun" SET "updatedAt" = now() - interval '30 hours' WHERE "id" = ${input.id}
      `;

      await purge.sweep();

      // A phone silent for a day may still come back. Closing starts the 48h
      // clock; deleting would throw away twenty minutes of an emergency.
      const row = await prisma.liveRun.findUniqueOrThrow({ where: { id: input.id } });
      expect(row.state).toBe(LiveRunState.CLOSED);
      expect(row.closedAt).not.toBeNull();
    });

    it('never moves stock for materials tapped on a run that force-closes without becoming a report', async () => {
      const bandage = await createMaterialItem('Ligadura Abandonada');
      const input = draft({
        capture: {
          notes: 'Consciente e orientada.',
          materials: [{ materialItemId: bandage.id, quantity: 3, at: '2024-08-22T20:20:00.000Z' }],
        },
      });
      await runs.sync(input, tiagoUser);
      await prisma.$executeRaw`
        UPDATE "LiveRun" SET "updatedAt" = now() - interval '30 hours' WHERE "id" = ${input.id}
      `;

      await purge.sweep();

      const row = await prisma.liveRun.findUniqueOrThrow({ where: { id: input.id } });
      expect(row.state).toBe(LiveRunState.CLOSED);
      // Force-closed, not filed: no report ever came out of this run, so the
      // materials sitting in `capture` were never even looked at.
      expect(row.reportId).toBeNull();
      await expect(prisma.stockMovement.count({ where: { materialItemId: bandage.id } })).resolves.toBe(0);
    });

    it('leaves an open run that is merely quiet alone', async () => {
      const input = draft();
      await runs.sync(input, tiagoUser);

      await purge.sweep();

      const row = await prisma.liveRun.findUniqueOrThrow({ where: { id: input.id } });
      expect(row.state).toBe(LiveRunState.ON_SCENE);
      expect(row.identity).not.toBeNull();
    });
  });

  // ── What the database itself refuses ───────────────────────────────────────

  describe('database invariants', () => {
    it('refuses a closed run with no close time, and an open one with a close time', async () => {
      const input = draft();
      await runs.sync(input, tiagoUser);

      await expect(
        prisma.liveRun.update({
          where: { id: input.id },
          data: { state: LiveRunState.CLOSED as never },
        }),
      ).rejects.toThrow(/LiveRun_closed_has_time/);

      await expect(
        prisma.liveRun.update({ where: { id: input.id }, data: { closedAt: new Date() } }),
      ).rejects.toThrow(/LiveRun_closed_has_time/);
    });

    it('refuses identity that is present and purged at the same time', async () => {
      const input = draft();
      await runs.sync(input, tiagoUser);

      // "Purged" has to mean the bytes are gone, or the column records a promise
      // nobody kept.
      await expect(
        prisma.liveRun.update({
          where: { id: input.id },
          data: { identityPurgedAt: new Date() },
        }),
      ).rejects.toThrow(/LiveRun_purged_means_empty/);
    });

    it('refuses a negative revision', async () => {
      const input = draft();
      await runs.sync(input, tiagoUser);

      await expect(
        prisma.liveRun.update({ where: { id: input.id }, data: { revision: -1 } }),
      ).rejects.toThrow(/LiveRun_revision_non_negative/);
    });

    it('refuses two runs pointing at the same report', async () => {
      const first = draft();
      const second = draft();
      await runs.sync(first, tiagoUser);
      await runs.sync(second, tiagoUser);
      const { report } = await runs.close(first.id, tiagoUser);
      createdReportIds.push(report.id);

      await expect(
        prisma.liveRun.update({ where: { id: second.id }, data: { reportId: report.id } }),
      ).rejects.toThrow(/Unique constraint failed/);
    });

    it('refuses a set of observations with every measurement null', async () => {
      const input = draft();
      await runs.sync(input, tiagoUser);
      const { report } = await runs.close(input.id, tiagoUser);
      createdReportIds.push(report.id);

      await expect(
        prisma.eventReportAssessment.create({
          data: { reportId: report.id, position: 1, takenAt: new Date('2024-08-22T21:00:00Z') },
        }),
      ).rejects.toThrow(/EventReportAssessment_not_empty/);
    });

    it('refuses a vital outside the range the form offers', async () => {
      const input = draft();
      await runs.sync(input, tiagoUser);
      const { report } = await runs.close(input.id, tiagoUser);
      createdReportIds.push(report.id);

      // The same bounds as `VITALS_RANGES`, kept in the one copy that cannot be
      // bypassed by a client that skipped the form.
      await expect(
        prisma.eventReportAssessment.create({
          data: {
            reportId: report.id,
            position: 2,
            takenAt: new Date('2024-08-22T21:00:00Z'),
            spo2: 101,
          },
        }),
      ).rejects.toThrow(/EventReportAssessment_ranges/);
      await expect(
        prisma.eventReportAssessment.create({
          data: {
            reportId: report.id,
            position: 3,
            takenAt: new Date('2024-08-22T21:00:00Z'),
            glasgow: 2,
          },
        }),
      ).rejects.toThrow(/EventReportAssessment_ranges/);
    });

    it('keeps exactly one row of delegation settings', async () => {
      const settings = await new DelegationSettingsService(prisma).get();
      expect(settings).toMatchObject({
        baseName: DEFAULT_DELEGATION_SETTINGS.baseName,
        coduDadosPhone: DEFAULT_DELEGATION_SETTINGS.coduDadosPhone,
      });

      await expect(
        prisma.delegationSettings.create({
          data: {
            id: 'a-second-delegation',
            baseName: 'Somewhere else',
            baseLatitude: 0,
            baseLongitude: 0,
            coduDadosPhone: '+351000000000',
          },
        }),
      ).rejects.toThrow(/DelegationSettings_single_row/);
    });
  });
});
