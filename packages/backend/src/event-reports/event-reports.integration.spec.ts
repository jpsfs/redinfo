import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PrismaClient } from '@prisma/client';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  AvailabilityWindowCategory,
  AvailabilityWindowStatus,
  EventLocationType,
  EventReportAttachmentKind,
  EventReportInput,
  EventReportType,
  Gender,
  ScheduleStatus,
  UserRole,
  VictimDestinationKind,
  foldForSearch,
  formatEventReportCode,
  toMinuteOfDay,
} from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { HolidaysService } from '../availability/holidays.service';
import { ShiftScheduleService } from '../availability/shift-schedule.service';
import { GeographyService } from '../geography/geography.service';
import { HospitalsService } from '../hospitals/hospitals.service';
import { EventReportsService, RequestUser } from './event-reports.service';
import { EventReportNumbering } from './event-report-numbering';
import { EventReportCrewService } from './event-report-crew.service';
import { EventReportAttachmentsService } from './event-report-attachments.service';
import { DiskAttachmentStorage } from './attachment-storage';

/**
 * Integration coverage for event reports (ADO #151), against a real Postgres —
 * the CI `postgres` service or a local compose one.
 *
 * Skipped unless DATABASE_URL is set, and named so
 * `pnpm --filter backend test -- -t "integration"` selects it. Runs serially
 * with the other integration suites (see `jest.maxWorkers` in package.json) and
 * cleans up everything it creates.
 *
 * What only a real database can answer, and is therefore here rather than in a
 * unit test: the per-type numbering sequence, the CHECK constraints that keep a
 * victim's destination coherent, the crew pre-fill reading through three joins,
 * and hospital ordering over real coordinates.
 */
const describeIntegration = process.env.DATABASE_URL ? describe : describe.skip;

/** Short enough to append a suffix to without any column caring. */
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
const email = (local: string) => `${local}.${RUN}@event-reports.test`;

describeIntegration('Event reports (integration)', () => {
  const prisma = new PrismaClient() as unknown as PrismaService;

  let reports: EventReportsService;
  let crewService: EventReportCrewService;
  let hospitals: HospitalsService;
  let geography: GeographyService;
  let attachments: EventReportAttachmentsService;
  let attachmentRoot: string;

  // Field crew and a coordinator, so the access rules have real subjects.
  let tiago: { id: string };
  let ana: { id: string };
  let outsider: { id: string };
  let coordinator: { id: string };

  let tiagoUser: RequestUser;
  let outsiderUser: RequestUser;
  let coordinatorUser: RequestUser;

  // Geography created by this run, so the suite never leans on the seed.
  let nearMunicipality: { id: string };
  let farMunicipality: { id: string };
  let taveiro: { id: string };
  let accented: { id: string };
  let nearHospital: { id: string };
  let farHospital: { id: string };

  let vehicleA: { id: string };
  let vehicleB: { id: string };

  const createdReportIds: string[] = [];

  /** Far enough apart that the ordering is unambiguous: ~47 km. */
  const NEAR = { latitude: 40.2111, longitude: -8.4289 }; // Coimbra
  const FAR = { latitude: 40.1508, longitude: -8.8556 }; // Figueira da Foz

  const input = (overrides: Partial<EventReportInput> = {}): EventReportInput => ({
    type: EventReportType.EMERGENCY,
    occurredOn: '2029-08-22',
    startedAt: '2029-08-22T20:14:00.000Z',
    endedAt: '2029-08-22T22:05:00.000Z',
    externalReference: '2608 4471',
    locationType: EventLocationType.HOME,
    localityId: taveiro.id,
    operationalReport: '<p>Vítima consciente após queda.</p>',
    crew: [{ userId: tiago.id, roleName: 'Driver' }],
    vehicles: [{ vehicleId: vehicleA.id, kilometres: 42 }],
    victims: [
      {
        gender: Gender.FEMALE,
        age: 67,
        destinationKind: VictimDestinationKind.HOSPITAL,
        destinationHospitalId: nearHospital.id,
      },
    ],
    ...overrides,
  });

  /** Files a report and remembers it for cleanup. */
  const file = async (overrides: Partial<EventReportInput> = {}, by = tiago.id) => {
    const created = await reports.create(input(overrides), by);
    createdReportIds.push(created.id);
    return created;
  };

  beforeAll(async () => {
    const holidays = new HolidaysService(prisma);
    const shiftSchedule = new ShiftScheduleService(holidays, prisma);
    geography = new GeographyService(prisma);
    hospitals = new HospitalsService(prisma, geography);
    reports = new EventReportsService(prisma, shiftSchedule, new EventReportNumbering());
    crewService = new EventReportCrewService(prisma, shiftSchedule);

    attachmentRoot = await mkdtemp(join(tmpdir(), 'redinfo-it-attachments-'));
    attachments = new EventReportAttachmentsService(
      prisma,
      reports,
      new DiskAttachmentStorage(attachmentRoot),
    );

    const makeUser = (local: string, role: UserRole, isDriver = false) =>
      prisma.user.create({
        data: {
          email: email(local),
          firstName: local[0].toUpperCase() + local.slice(1),
          lastName: 'Test',
          role,
          isActive: true,
          isDriver,
        },
      });

    tiago = await makeUser('tiago', UserRole.EMERGENCY_OPERATIONAL, true);
    ana = await makeUser('ana', UserRole.EMERGENCY_OPERATIONAL);
    outsider = await makeUser('outsider', UserRole.EMERGENCY_OPERATIONAL);
    coordinator = await makeUser('coordinator', UserRole.EMERGENCY_COORDINATOR);

    tiagoUser = { id: tiago.id, role: UserRole.EMERGENCY_OPERATIONAL };
    outsiderUser = { id: outsider.id, role: UserRole.EMERGENCY_OPERATIONAL };
    coordinatorUser = { id: coordinator.id, role: UserRole.EMERGENCY_COORDINATOR };

    // Own geography, with INE codes that cannot collide with the real dataset.
    nearMunicipality = await prisma.municipality.create({
      data: {
        ineCode: `IT-${RUN}-N`,
        name: `Near ${RUN}`,
        district: `District ${RUN}`,
        ...NEAR,
      },
    });
    farMunicipality = await prisma.municipality.create({
      data: {
        ineCode: `IT-${RUN}-F`,
        name: `Far ${RUN}`,
        district: `District ${RUN}`,
        ...FAR,
      },
    });

    taveiro = await prisma.locality.create({
      data: {
        name: 'Taveiro',
        searchName: foldForSearch('Taveiro'),
        municipalityId: nearMunicipality.id,
      },
    });
    accented = await prisma.locality.create({
      data: {
        name: 'São Martinho do Bispo',
        searchName: foldForSearch('São Martinho do Bispo'),
        municipalityId: nearMunicipality.id,
      },
    });

    nearHospital = await prisma.hospital.create({
      data: { name: `Hospital Near ${RUN}`, municipalityId: nearMunicipality.id },
    });
    farHospital = await prisma.hospital.create({
      data: { name: `Hospital Far ${RUN}`, municipalityId: farMunicipality.id },
    });

    const makeVehicle = (suffix: string) =>
      prisma.vehicle.create({
        data: {
          // Plate format is validated at the API edge, not in the database;
          // uniqueness is all this needs.
          licensePlate: `IT-${RUN}-${suffix}`,
          numeroCauda: `IT-${RUN}-${suffix}`,
          vehicleType: 'EMERGENCY',
          insuranceRenewalDate: new Date('2030-01-01T00:00:00.000Z'),
          nextImtInspectionDate: new Date('2030-01-01T00:00:00.000Z'),
        },
      });

    vehicleA = await makeVehicle('A');
    vehicleB = await makeVehicle('B');
  });

  afterAll(async () => {
    // Reports cascade their crew, vehicles, victims and attachments.
    if (createdReportIds.length) {
      await prisma.eventReport.deleteMany({ where: { id: { in: createdReportIds } } });
    }
    await prisma.availabilityWindow.deleteMany({
      where: { name: { contains: RUN } },
    });
    await prisma.hospital.deleteMany({ where: { name: { contains: RUN } } });
    // Localities cascade from their municipality.
    await prisma.municipality.deleteMany({ where: { district: `District ${RUN}` } });
    await prisma.vehicle.deleteMany({
      where: { id: { in: [vehicleA?.id, vehicleB?.id].filter(Boolean) as string[] } },
    });
    await prisma.user.deleteMany({
      where: {
        id: {
          in: [tiago?.id, ana?.id, outsider?.id, coordinator?.id].filter(Boolean) as string[],
        },
      },
    });
    await rm(attachmentRoot, { recursive: true, force: true });
    await prisma.$disconnect();
  });

  // ── Numbering ───────────────────────────────────────────────────────────────

  describe('report numbering', () => {
    it('counts up within a type and a year', async () => {
      const first = await file();
      const second = await file();

      expect(second.number).toBe(first.number! + 1);
      expect(second.year).toBe(2029);
      expect(second.type).toBe(EventReportType.EMERGENCY);
    });

    it('counts each type independently', async () => {
      const emergency = await file();
      const support = await file({
        type: EventReportType.LOCAL_SUPPORT,
        externalReference: null,
      });

      // The support sequence has its own life; the only thing tying them
      // together would be a shared counter, which is exactly what this refuses.
      const nextEmergency = await file();
      expect(nextEmergency.number).toBe(emergency.number! + 1);

      const nextSupport = await file({
        type: EventReportType.LOCAL_SUPPORT,
        externalReference: null,
      });
      expect(nextSupport.number).toBe(support.number! + 1);
    });

    it('starts a new year over again', async () => {
      const older = await file({
        occurredOn: '2028-12-31',
        startedAt: '2028-12-31T23:30:00.000Z',
        endedAt: '2029-01-01T01:00:00.000Z',
      });

      expect(older.year).toBe(2028);
      expect(older.number).toBe(1);
    });

    it('hands out no two numbers to concurrent filings', async () => {
      // The counter upsert row-locks for the statement, so ten simultaneous
      // filings must come back with ten distinct numbers.
      const created = await Promise.all(
        Array.from({ length: 10 }, () =>
          reports.create(input({ type: EventReportType.SALOP_SUPPORT }), tiago.id),
        ),
      );
      createdReportIds.push(...created.map((report) => report.id));

      const numbers = created.map((report) => report.number);
      expect(new Set(numbers).size).toBe(10);
    });

    it('renders the code the crew reads off the screen', async () => {
      const report = await file();
      expect(formatEventReportCode(report)).toMatch(/^EMG \d{3,}\/2029$/);
    });
  });

  // ── Numbering as a projection ───────────────────────────────────────────────
  //
  // A report's number is its *position among the filed reports of one
  // (type, year), ordered by activation time* — recomputed whole rather than
  // handed out. Only a real Postgres can answer whether that holds: the
  // ordering, the advisory lock and the deferrable unique constraint are all in
  // the database, and there is nothing to test in a unit.

  describe('numbering by activation order', () => {
    /**
     * A filed report in its own year, activated on a chosen day.
     *
     * Its own year per test group so the partition is this test's alone — a
     * resequence is partition-scoped, so two tests sharing (type, year) would
     * renumber each other's rows.
     */
    const filedOn = (year: number, day: string, type = EventReportType.SALOP_SUPPORT) =>
      file({
        type,
        externalReference: type === EventReportType.EMERGENCY ? '2608 4471' : null,
        occurredOn: `${year}-08-${day}`,
        startedAt: `${year}-08-${day}T20:00:00.000Z`,
        endedAt: `${year}-08-${day}T21:00:00.000Z`,
        activationAt: type === EventReportType.EMERGENCY ? `${year}-08-${day}T20:00:00.000Z` : null,
        victims: [],
      });

    const numbersIn = async (year: number, type = EventReportType.SALOP_SUPPORT) => {
      const rows = await prisma.eventReport.findMany({
        where: { year, type: type as never, submittedAt: { not: null } },
        orderBy: { number: 'asc' },
        select: { number: true, occurredOn: true },
      });
      return rows.map((row) => [row.occurredOn.toISOString().slice(0, 10), row.number]);
    };

    it('numbers three out-of-order filings by when they happened', async () => {
      // Filed 20th, 18th, 19th — a crew that got round to the paperwork days
      // later, which is the ordinary case this exists for.
      await filedOn(2031, '20');
      await filedOn(2031, '18');
      await filedOn(2031, '19');

      await expect(numbersIn(2031)).resolves.toEqual([
        ['2031-08-18', 1],
        ['2031-08-19', 2],
        ['2031-08-20', 3],
      ]);
    });

    it('shifts a whole partition along in one statement', async () => {
      // Three on file, then one activated before all of them. Every existing
      // number moves up by one, which transiently collides with itself — so this
      // succeeding is the only real proof the unique constraint is deferrable.
      // With an immediate constraint it fails on the first row it touches.
      await filedOn(2032, '18');
      await filedOn(2032, '19');
      await filedOn(2032, '20');
      await expect(numbersIn(2032)).resolves.toEqual([
        ['2032-08-18', 1],
        ['2032-08-19', 2],
        ['2032-08-20', 3],
      ]);

      await filedOn(2032, '17');

      await expect(numbersIn(2032)).resolves.toEqual([
        ['2032-08-17', 1],
        ['2032-08-18', 2],
        ['2032-08-19', 3],
        ['2032-08-20', 4],
      ]);
    });

    it('keeps the number a displaced report was first given, forever', async () => {
      const second = await filedOn(2033, '19');
      expect(second.number).toBe(1);

      await filedOn(2033, '18');

      const displaced = await reports.findOne(second.id, coordinatorUser);
      expect(displaced.number).toBe(2);
      // Someone holding the paper printed "SAL 001/2033". That has to remain
      // findable, so the *first* number is kept rather than the previous one.
      expect(displaced.legacyNumber).toBe(1);
    });

    it('finds a renumbered report by the code that was printed on it', async () => {
      const report = await filedOn(2034, '19');
      const printed = formatEventReportCode(report);
      expect(printed).not.toBeNull();

      await filedOn(2034, '18');

      const { data } = await reports.findAll({ q: printed! }, 1, 50);
      expect(data.map((entry) => entry.id)).toContain(report.id);
    });

    it('closes the gap when a report in the middle is deleted', async () => {
      await filedOn(2035, '18');
      const middle = await filedOn(2035, '19');
      await filedOn(2035, '20');

      const { renumbered } = await reports.remove(middle.id, coordinatorUser);

      expect(renumbered).toEqual([{ reportId: expect.any(String), from: 3, to: 2 }]);
      await expect(numbersIn(2035)).resolves.toEqual([
        ['2035-08-18', 1],
        ['2035-08-20', 2],
      ]);
    });

    it('gives a draft no number at all', async () => {
      const draft = await reports.create(
        input({ occurredOn: '2036-08-18', startedAt: '2036-08-18T20:00:00.000Z', endedAt: null }),
        tiago.id,
        { submit: false },
      );
      createdReportIds.push(draft.id);

      expect(draft.number).toBeNull();
      expect(draft.submittedAt).toBeNull();
      expect(formatEventReportCode(draft)).toBeNull();
      // And it is invisible to the filed partition, so it displaces nothing.
      await expect(numbersIn(2036, EventReportType.EMERGENCY)).resolves.toEqual([]);
    });

    it('leaves concurrent filings numbered 1..n, with no two the same', async () => {
      const drafts = await Promise.all(
        ['11', '12', '13', '14', '15'].map((day) =>
          reports.create(
            input({
              type: EventReportType.LOCAL_SUPPORT,
              externalReference: null,
              occurredOn: `2037-08-${day}`,
              startedAt: `2037-08-${day}T20:00:00.000Z`,
              endedAt: `2037-08-${day}T21:00:00.000Z`,
              activationAt: null,
              victims: [],
            }),
            tiago.id,
            { submit: false },
          ),
        ),
      );
      createdReportIds.push(...drafts.map((draft) => draft.id));

      // All five at once, and every one of them succeeds. Without the advisory
      // lock two of these compute the same position from the same snapshot, and
      // the deferred unique constraint then fails one of them at commit.
      await Promise.all(drafts.map((draft) => reports.submit(draft.id, coordinatorUser)));

      // The *stored* numbers are what the assertion is about, not the ones each
      // call returned. A number is a position, so a report filed second can be
      // handed "1" and become "2" a moment later when an earlier one is filed —
      // the caller's copy is a snapshot, and the partition is the truth.
      await expect(numbersIn(2037, EventReportType.LOCAL_SUPPORT)).resolves.toEqual([
        ['2037-08-11', 1],
        ['2037-08-12', 2],
        ['2037-08-13', 3],
        ['2037-08-14', 4],
        ['2037-08-15', 5],
      ]);
    });

    it('refuses an operational the filing that would renumber filed reports', async () => {
      await filedOn(2038, '19');
      const late = await reports.create(
        input({
          type: EventReportType.SALOP_SUPPORT,
          externalReference: null,
          occurredOn: '2038-08-18',
          startedAt: '2038-08-18T20:00:00.000Z',
          endedAt: '2038-08-18T21:00:00.000Z',
          activationAt: null,
          victims: [],
        }),
        tiago.id,
        { submit: false },
      );
      createdReportIds.push(late.id);

      // Rewriting a number that is already in a binder reaches a coordinator's
      // judgement rather than happening by an operational's thumb.
      await expect(reports.submit(late.id, tiagoUser)).rejects.toThrow(/already filed/i);
      await expect(reports.submit(late.id, coordinatorUser)).resolves.toMatchObject({
        report: { number: 1 },
      });
    });
  });

  // ── What the database itself refuses ────────────────────────────────────────

  describe('database invariants', () => {
    it('refuses a transported victim with no hospital', async () => {
      const report = await file({ victims: [] });

      await expect(
        prisma.eventReportVictim.create({
          data: {
            reportId: report.id,
            position: 0,
            gender: Gender.MALE,
            age: 40,
            destinationKind: VictimDestinationKind.HOSPITAL,
            destinationHospitalId: null,
          },
        }),
      ).rejects.toThrow(/EventReportVictim_destination_pairing/);
    });

    it('refuses a hospital on a victim who was never transported', async () => {
      const report = await file({ victims: [] });

      await expect(
        prisma.eventReportVictim.create({
          data: {
            reportId: report.id,
            position: 0,
            gender: Gender.MALE,
            age: 40,
            destinationKind: VictimDestinationKind.REFUSED_TRANSPORT,
            destinationHospitalId: nearHospital.id,
          },
        }),
      ).rejects.toThrow(/EventReportVictim_destination_pairing/);
    });

    it('refuses negative kilometres', async () => {
      const report = await file({ vehicles: [] });

      await expect(
        prisma.eventReportVehicle.create({
          data: {
            reportId: report.id,
            vehicleId: vehicleA.id,
            kilometres: -5,
            position: 0,
          },
        }),
      ).rejects.toThrow(/kilometres_non_negative/);
    });

    it('refuses an end before the start', async () => {
      const report = await file();

      await expect(
        prisma.eventReport.update({
          where: { id: report.id },
          data: { endedAt: new Date('2029-08-22T19:00:00.000Z') },
        }),
      ).rejects.toThrow(/ends_after_start/);
    });

    it('refuses half a shift reference', async () => {
      const report = await file();

      await expect(
        prisma.eventReport.update({
          where: { id: report.id },
          data: { shiftSlot: 1 },
        }),
      ).rejects.toThrow(/shift_reference_complete/);
    });

    it('refuses the same person on one report twice', async () => {
      const report = await file();

      await expect(
        prisma.eventReportCrewMember.create({
          data: { reportId: report.id, userId: tiago.id, position: 1 },
        }),
      ).rejects.toThrow();
    });

    it('keeps a vehicle from being deleted out from under a report', async () => {
      const report = await file();
      expect(report.vehicles).toHaveLength(1);

      await expect(prisma.vehicle.delete({ where: { id: vehicleA.id } })).rejects.toThrow();
    });
  });

  // ── Round trip ──────────────────────────────────────────────────────────────

  describe('filing and reading back', () => {
    it('stores every part of the report', async () => {
      const report = await file({
        activationAt: '2029-08-22T20:14:00.000Z',
        sceneArrivalAt: '2029-08-22T20:26:00.000Z',
        sceneDepartureAt: '2029-08-22T20:44:00.000Z',
        hospitalArrivalAt: '2029-08-22T20:53:00.000Z',
        crew: [
          { userId: tiago.id, roleName: 'Driver' },
          { userId: ana.id, roleName: 'Team Leader' },
        ],
      });

      const read = await reports.findOne(report.id, coordinatorUser);

      expect(read).toMatchObject({
        type: EventReportType.EMERGENCY,
        occurredOn: '2029-08-22',
        externalReference: '2608 4471',
        locationType: EventLocationType.HOME,
        localityId: taveiro.id,
      });
      expect(read.activationAt).toBe('2029-08-22T20:14:00.000Z');
      expect(read.availableAt).toBeNull();
      expect(read.crew.map((member) => member.roleName)).toEqual(['Driver', 'Team Leader']);
      expect(read.locality?.municipality?.name).toBe(`Near ${RUN}`);
      expect(read.victims[0].destinationHospital?.name).toBe(`Hospital Near ${RUN}`);
      expect(read.vehicles[0].vehicle?.id).toBe(vehicleA.id);
    });

    it('keeps the crew in the order it was entered', async () => {
      const report = await file({
        crew: [{ userId: ana.id }, { userId: tiago.id }],
      });

      const read = await reports.findOne(report.id, coordinatorUser);
      expect(read.crew.map((member) => member.userId)).toEqual([ana.id, tiago.id]);
      expect(read.crew.map((member) => member.position)).toEqual([0, 1]);
    });

    it('files a report with nothing but the essentials', async () => {
      const report = await file({
        endedAt: null,
        operationalReport: '',
        crew: [],
        vehicles: [],
        victims: [],
      });

      const read = await reports.findOne(report.id, coordinatorUser);
      expect(read.endedAt).toBeNull();
      expect(read.crew).toEqual([]);
      expect(read.victims).toEqual([]);
    });

    it('records several victims with different destinations', async () => {
      const report = await file({
        type: EventReportType.LOCAL_SUPPORT,
        externalReference: null,
        victims: [
          {
            gender: Gender.FEMALE,
            age: 67,
            destinationKind: VictimDestinationKind.HOSPITAL,
            destinationHospitalId: nearHospital.id,
          },
          {
            gender: Gender.MALE,
            age: 14,
            destinationKind: VictimDestinationKind.TREATED_ON_SCENE,
          },
          {
            gender: Gender.UNKNOWN,
            age: 40,
            destinationKind: VictimDestinationKind.REFUSED_TRANSPORT,
          },
        ],
        vehicles: [
          { vehicleId: vehicleA.id, kilometres: 51 },
          { vehicleId: vehicleB.id, kilometres: 36 },
        ],
      });

      const read = await reports.findOne(report.id, coordinatorUser);
      expect(read.victims).toHaveLength(3);
      expect(read.victims[0].destinationHospitalId).toBe(nearHospital.id);
      expect(read.victims[1].destinationHospitalId).toBeNull();
      expect(read.vehicles.map((entry) => entry.kilometres)).toEqual([51, 36]);
    });
  });

  // ── Editing ─────────────────────────────────────────────────────────────────

  describe('finishing a report later', () => {
    it('lets the crew add the end time and the narrative', async () => {
      const report = await file({ endedAt: null, operationalReport: '' });

      const updated = await reports.update(
        report.id,
        input({
          endedAt: '2029-08-22T22:05:00.000Z',
          operationalReport: '<p>Escrito na manhã seguinte.</p>',
        }),
        tiagoUser,
      );

      expect(updated.endedAt).toBe('2029-08-22T22:05:00.000Z');
      expect(updated.operationalReport).toContain('manhã seguinte');
      // Identity never moves.
      expect(updated.number).toBe(report.number);
      expect(updated.year).toBe(report.year);
    });

    it('replaces the victims rather than accumulating them', async () => {
      const report = await file({
        type: EventReportType.LOCAL_SUPPORT,
        externalReference: null,
        victims: [
          { gender: Gender.MALE, age: 20, destinationKind: VictimDestinationKind.CANCELLED },
          { gender: Gender.MALE, age: 21, destinationKind: VictimDestinationKind.CANCELLED },
        ],
      });

      const updated = await reports.update(
        report.id,
        input({
          type: EventReportType.LOCAL_SUPPORT,
          externalReference: null,
          victims: [
            { gender: Gender.FEMALE, age: 30, destinationKind: VictimDestinationKind.CANCELLED },
          ],
        }),
        tiagoUser,
      );

      expect(updated.victims).toHaveLength(1);
      expect(updated.victims[0].age).toBe(30);
      expect(updated.victims[0].position).toBe(0);
    });

    it('refuses an incoherent edit and leaves the stored report untouched', async () => {
      const report = await file();

      await expect(
        reports.update(report.id, input({ externalReference: null }), tiagoUser),
      ).rejects.toThrow(BadRequestException);

      const read = await reports.findOne(report.id, coordinatorUser);
      expect(read.externalReference).toBe('2608 4471');
    });
  });

  // ── Who may see what ────────────────────────────────────────────────────────

  describe('access', () => {
    it('lets the crew read their own report and refuses an outsider', async () => {
      const report = await file({ crew: [{ userId: tiago.id }] }, coordinator.id);

      await expect(reports.findOne(report.id, tiagoUser)).resolves.toMatchObject({
        id: report.id,
      });
      await expect(reports.findOne(report.id, outsiderUser)).rejects.toThrow(ForbiddenException);
    });

    it('lists only the reports someone was on', async () => {
      const mine = await file({ crew: [{ userId: tiago.id }] }, coordinator.id);
      await file({ crew: [{ userId: ana.id }] }, coordinator.id);

      const { data } = await reports.findMine(tiago.id, {}, 1, 100);
      const ids = data.map((report) => report.id);

      expect(ids).toContain(mine.id);
      expect(data.every((report) => report.crew.some((m) => m.userId === tiago.id) || report.createdById === tiago.id)).toBe(true);
    });

    it('refuses deletion to the crew and allows it to a coordinator', async () => {
      const report = await file();

      await expect(reports.remove(report.id, tiagoUser)).rejects.toThrow(ForbiddenException);
      await expect(reports.remove(report.id, coordinatorUser)).resolves.toMatchObject({
        id: report.id,
      });
    });
  });

  // ── Searching ───────────────────────────────────────────────────────────────

  describe('finding a report again', () => {
    it('finds it by the code printed on it', async () => {
      const report = await file();
      const code = formatEventReportCode(report);
      expect(code).not.toBeNull();

      const { data } = await reports.findAll({ q: code! }, 1, 50);
      expect(data.map((entry) => entry.id)).toContain(report.id);
    });

    it('finds it by locality and by a crew member’s name', async () => {
      const report = await file({ crew: [{ userId: tiago.id }] });

      const byLocality = await reports.findAll({ q: 'Taveiro' }, 1, 100);
      expect(byLocality.data.map((entry) => entry.id)).toContain(report.id);

      const byName = await reports.findAll({ q: 'Tiago' }, 1, 100);
      expect(byName.data.map((entry) => entry.id)).toContain(report.id);
    });

    it('narrows to a date range and a type', async () => {
      const report = await file();

      const inRange = await reports.findAll(
        { type: EventReportType.EMERGENCY, from: '2029-08-01', to: '2029-08-31' },
        1,
        100,
      );
      expect(inRange.data.map((entry) => entry.id)).toContain(report.id);

      const outOfRange = await reports.findAll({ from: '2029-09-01' }, 1, 100);
      expect(outOfRange.data.map((entry) => entry.id)).not.toContain(report.id);
    });

    it('counts each type for the filter tabs', async () => {
      await file();
      const counts = await reports.counts({ from: '2029-01-01', to: '2029-12-31' });

      expect(counts[EventReportType.EMERGENCY]).toBeGreaterThan(0);
      expect(counts.ALL).toBeGreaterThanOrEqual(counts[EventReportType.EMERGENCY]);
      expect(counts).toHaveProperty(EventReportType.SALOP_SUPPORT);
    });
  });

  // ── Geography and hospitals ─────────────────────────────────────────────────

  describe('locality search', () => {
    it('finds an accented name typed without accents', async () => {
      const results = await geography.searchLocalities('sao martinho');
      expect(results.map((entry) => entry.id)).toContain(accented.id);
    });

    it('finds it whatever order the words are typed in', async () => {
      const results = await geography.searchLocalities('bispo martinho');
      expect(results.map((entry) => entry.id)).toContain(accented.id);
    });

    it('carries the concelho and distrito the picker shows', async () => {
      const [found] = (await geography.searchLocalities('Taveiro')).filter(
        (entry) => entry.id === taveiro.id,
      );
      expect(found.municipality).toMatchObject({ name: `Near ${RUN}` });
    });
  });

  describe('hospital picker', () => {
    it('offers the nearest hospital to the report’s locality first', async () => {
      const list = await hospitals.findForPicker(taveiro.id);
      const ours = list.filter((entry) =>
        [nearHospital.id, farHospital.id].includes(entry.id),
      );

      expect(ours.map((entry) => entry.id)).toEqual([nearHospital.id, farHospital.id]);
      expect(ours[0].distanceKm).toBeLessThan(ours[1].distanceKm!);
    });

    it('measures from the municipality centroid, and says so', async () => {
      const list = await hospitals.findForPicker(taveiro.id);
      const near = list.find((entry) => entry.id === nearHospital.id)!;

      expect(near.approximate).toBe(true);
      expect(near.distanceKm).toBe(0);
    });

    it('sharpens the distance once the hospital has its own coordinates', async () => {
      await hospitals.update(nearHospital.id, { latitude: 40.1976, longitude: -8.4392 });

      const list = await hospitals.findForPicker(taveiro.id);
      const near = list.find((entry) => entry.id === nearHospital.id)!;

      expect(near.approximate).toBe(false);
      expect(near.distanceKm).toBeGreaterThan(0);

      await hospitals.update(nearHospital.id, { latitude: null, longitude: null });
    });

    it('retires a hospital a report names, instead of deleting it', async () => {
      // The report's victim was taken here, so the row cannot go: the report
      // has to keep naming it.
      const report = await file();

      const retired = await hospitals.remove(nearHospital.id);
      expect(retired.isActive).toBe(false);

      const list = await hospitals.findForPicker(taveiro.id);
      expect(list.map((entry) => entry.id)).not.toContain(nearHospital.id);

      const read = await reports.findOne(report.id, coordinatorUser);
      expect(read.victims[0].destinationHospital?.name).toBe(`Hospital Near ${RUN}`);

      await prisma.hospital.update({
        where: { id: nearHospital.id },
        data: { isActive: true },
      });
    });

    it('deletes a hospital no report has ever named', async () => {
      const unused = await prisma.hospital.create({
        data: { name: `Hospital Unused ${RUN}`, municipalityId: farMunicipality.id },
      });

      await hospitals.remove(unused.id);

      await expect(
        prisma.hospital.count({ where: { id: unused.id } }),
      ).resolves.toBe(0);
    });
  });

  // ── Crew pre-fill ───────────────────────────────────────────────────────────

  describe('crew pre-fill from the rota', () => {
    const SHIFT_DATE = '2029-08-22';
    let scheduleId: string;

    beforeAll(async () => {
      // A closed window, so this suite's rota cannot be picked up as "the open
      // window" by the availability suite. Crew pre-fill reads published
      // schedules, not window status, so closing it changes nothing here.
      const window = await prisma.availabilityWindow.create({
        data: {
          startDate: new Date(`${SHIFT_DATE}T00:00:00.000Z`),
          endDate: new Date(`${SHIFT_DATE}T00:00:00.000Z`),
          category: AvailabilityWindowCategory.EMERGENCY,
          name: `Emergency ${RUN}`,
          status: AvailabilityWindowStatus.CLOSED,
          openedById: coordinator.id,
          shifts: {
            create: [
              {
                date: new Date(`${SHIFT_DATE}T00:00:00.000Z`),
                slot: 1,
                startMinute: toMinuteOfDay(20),
                endMinute: toMinuteOfDay(24),
                vehiclesNeeded: 1,
              },
            ],
          },
          roles: {
            create: [
              { name: 'Driver', maxPeople: 1, order: 0, requiresDriverCertification: true },
              {
                name: 'Team Leader',
                maxPeople: 1,
                order: 1,
                requiresDriverCertification: false,
              },
            ],
          },
        },
        include: { roles: true },
      });

      const driverRole = window.roles.find((role) => role.name === 'Driver')!;
      const leadRole = window.roles.find((role) => role.name === 'Team Leader')!;

      const schedule = await prisma.schedule.create({
        data: {
          windowId: window.id,
          status: ScheduleStatus.PUBLISHED,
          createdById: coordinator.id,
          publishedById: coordinator.id,
          publishedAt: new Date(),
          assignments: {
            create: [
              {
                date: new Date(`${SHIFT_DATE}T00:00:00.000Z`),
                slot: 1,
                userId: tiago.id,
                roleId: driverRole.id,
                assignedById: coordinator.id,
              },
              {
                date: new Date(`${SHIFT_DATE}T00:00:00.000Z`),
                slot: 1,
                userId: ana.id,
                roleId: leadRole.id,
                assignedById: coordinator.id,
              },
            ],
          },
        },
      });
      scheduleId = schedule.id;
    });

    it('suggests the shift covering the moment the activity started', async () => {
      const { suggested } = await crewService.suggestCrew(
        EventReportType.EMERGENCY,
        new Date(`${SHIFT_DATE}T21:00:00.000Z`),
        new Date(`${SHIFT_DATE}T23:00:00.000Z`),
      );

      expect(suggested).toMatchObject({
        scheduleId,
        date: SHIFT_DATE,
        slot: 1,
        label: '20:00–24:00',
      });
      expect(suggested?.windowLabel).toBe(`Emergency ${RUN}`);
      expect(suggested?.crew.map((member) => member.roleName).sort()).toEqual([
        'Driver',
        'Team Leader',
      ]);
      expect(suggested?.crew.find((member) => member.userId === tiago.id)?.isDriver).toBe(true);
    });

    it('suggests nothing for a moment no shift covers, and offers it as recent instead', async () => {
      const { suggested, recent } = await crewService.suggestCrew(
        EventReportType.EMERGENCY,
        new Date(`${SHIFT_DATE}T10:00:00.000Z`),
        new Date(`${SHIFT_DATE}T23:00:00.000Z`),
      );

      expect(suggested).toBeNull();
      expect(recent.map((shift) => shift.scheduleId)).toContain(scheduleId);
    });

    it('never offers another rota’s shifts', async () => {
      const { suggested, recent } = await crewService.suggestCrew(
        EventReportType.SALOP_SUPPORT,
        new Date(`${SHIFT_DATE}T21:00:00.000Z`),
        new Date(`${SHIFT_DATE}T23:00:00.000Z`),
      );

      expect(suggested).toBeNull();
      expect(recent.map((shift) => shift.scheduleId)).not.toContain(scheduleId);
    });

    it('records the shift on the report, and labels it on the way back out', async () => {
      const report = await file({
        shift: { scheduleId, date: SHIFT_DATE, slot: 1 },
      });

      const read = await reports.findOne(report.id, coordinatorUser);
      expect(read.shift).toMatchObject({
        scheduleId,
        date: SHIFT_DATE,
        slot: 1,
        label: '20:00–24:00',
        windowLabel: `Emergency ${RUN}`,
      });
    });

    it('offers the crew roster without needing permission to read users', async () => {
      const candidates = await crewService.listCandidates();
      const ids = candidates.map((person) => person.id);

      expect(ids).toContain(tiago.id);
      expect(ids).toContain(coordinator.id);
    });
  });

  // ── Attachments ─────────────────────────────────────────────────────────────

  describe('attachments', () => {
    const photo = {
      originalname: 'foto.jpg',
      mimetype: 'image/jpeg',
      size: 5,
      buffer: Buffer.from('bytes'),
    };

    it('round-trips a photograph through disk', async () => {
      const report = await file();

      const added = await attachments.add(report.id, photo, tiagoUser);
      expect(added).toMatchObject({ filename: 'foto.jpg', byteSize: 5 });

      await expect(attachments.list(report.id, tiagoUser)).resolves.toHaveLength(1);
      await expect(
        attachments.download(report.id, added.id, tiagoUser),
      ).resolves.toMatchObject({ data: Buffer.from('bytes') });
    });

    it('shows up on the report itself', async () => {
      const report = await file();
      await attachments.add(report.id, photo, tiagoUser);

      const read = await reports.findOne(report.id, coordinatorUser);
      expect(read.attachments).toHaveLength(1);
      expect(read.attachments[0].uploadedBy?.id).toBe(tiago.id);
    });

    it('goes away with the report, leaving no rows behind', async () => {
      const report = await file();
      await attachments.add(report.id, photo, tiagoUser);

      await reports.remove(report.id, coordinatorUser);

      await expect(
        prisma.eventReportAttachment.count({ where: { reportId: report.id } }),
      ).resolves.toBe(0);
    });

    it('is refused to someone who was not there', async () => {
      const report = await file({ crew: [{ userId: tiago.id }] }, coordinator.id);
      await expect(attachments.add(report.id, photo, outsiderUser)).rejects.toThrow(
        ForbiddenException,
      );
    });

    describe('the Verbete de Socorro slot', () => {
      const verbete = {
        originalname: 'verbete.pdf',
        mimetype: 'application/pdf',
        size: 9,
        buffer: Buffer.from('paperwork'),
      };

      it('takes one, and marks it as one', async () => {
        const report = await file();

        const added = await attachments.add(
          report.id,
          verbete,
          tiagoUser,
          EventReportAttachmentKind.VERBETE,
        );
        expect(added.kind).toBe(EventReportAttachmentKind.VERBETE);

        const read = await reports.findOne(report.id, coordinatorUser);
        expect(read.attachments.filter((entry) => entry.kind === 'VERBETE')).toHaveLength(1);
      });

      it('refuses a second one, in words, before the index refuses it in Postgres', async () => {
        const report = await file();
        await attachments.add(report.id, verbete, tiagoUser, EventReportAttachmentKind.VERBETE);

        await expect(
          attachments.add(report.id, verbete, tiagoUser, EventReportAttachmentKind.VERBETE),
        ).rejects.toThrow(/already has a Verbete/i);
      });

      it('is backed by the database, not only by the service', async () => {
        // The partial unique index is what makes the rule true rather than
        // merely usually true — so it is asserted by going round the service.
        const report = await file();
        await attachments.add(report.id, verbete, tiagoUser, EventReportAttachmentKind.VERBETE);

        await expect(
          prisma.eventReportAttachment.create({
            data: {
              reportId: report.id,
              filename: 'segundo.pdf',
              mimeType: 'application/pdf',
              byteSize: 9,
              kind: EventReportAttachmentKind.VERBETE as never,
              storageKey: `${report.id}/segundo.pdf`,
              uploadedById: tiago.id,
            },
          }),
        ).rejects.toThrow(/Unique constraint failed.*reportId/s);
      });

      it('lets a photograph in alongside it, because photographs are not capped at one', async () => {
        const report = await file();
        await attachments.add(report.id, verbete, tiagoUser, EventReportAttachmentKind.VERBETE);
        await attachments.add(report.id, photo, tiagoUser);
        await attachments.add(report.id, photo, tiagoUser);

        await expect(attachments.list(report.id, tiagoUser)).resolves.toHaveLength(3);
      });

      it('refuses a Verbete on a type that has no such form', async () => {
        const support = await file({
          type: EventReportType.LOCAL_SUPPORT,
          externalReference: null,
        });

        await expect(
          attachments.add(support.id, verbete, tiagoUser, EventReportAttachmentKind.VERBETE),
        ).rejects.toThrow(/only an emergency/i);
      });
    });
  });
});
