import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PatientMobility, UserRole, foldForSearch } from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { IdentityCipher } from '../common/identity-cipher';
import { PatientsService, RequestUser } from './patients.service';
import { PatientIdentityPurgeService } from './patient-identity-purge.service';

/**
 * Integration coverage for non-urgent transport patients (#219, #226), against
 * a real Postgres.
 *
 * Skipped unless DATABASE_URL is set, and named so
 * `pnpm --filter backend test:integration` selects it.
 *
 * What only a real database answers, and is therefore here: that the
 * `identity` column really holds no plaintext, that it is bound to its own
 * row, that a caller without `VIEW_PATIENT_IDENTITY` gets it omitted from
 * *every* endpoint that returns a patient — list included, not only the
 * detail route — and that the purge sweep destroys the blob while the
 * unsealed profile (mobility, coordinates, id) survives.
 */
const describeIntegration = process.env.DATABASE_URL ? describe : describe.skip;

const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
const email = (local: string) => `${local}.${RUN}@patients.test`;

/** A name distinctive enough that finding it in a blob would be unambiguous. */
const PATIENT_NAME = `Maria Fernanda Costa ${RUN}`;

const identityPayload = () => ({
  fullName: PATIENT_NAME,
  telephone: '+351912345678',
  homeAddressLine: 'Rua do Castelo, 12',
  homePostalCode: '3000-123',
  homeLocality: 'Coimbra',
  referenceContactName: `Ana Costa ${RUN}`,
  referenceContactRelationship: 'Filha',
  referenceContactTelephone: '+351913456789',
});

describeIntegration('Patients (integration)', () => {
  const prisma = new PrismaClient() as unknown as PrismaService;

  let patients: PatientsService;
  let purge: PatientIdentityPurgeService;
  let cipher: IdentityCipher;

  let coordinatorRow: { id: string };
  let coordinatorUser: RequestUser;
  /** A hand-built stand-in for a future role holding `MANAGE_PATIENTS` without
   * `VIEW_PATIENT_IDENTITY` — no shipped role does yet (see `ROLE_PERMISSIONS`),
   * so the independence guarantee is exercised against the service directly,
   * the same way `permissions.spec.ts` fabricates the combination. */
  let managerOnlyUser: RequestUser;

  let municipality: { id: string };
  let locality: { id: string };

  const createdPatientIds: string[] = [];

  const rawIdentity = async (id: string): Promise<Buffer | null> => {
    const rows = await prisma.$queryRaw<Array<{ identity: Buffer | null }>>`
      SELECT "identity" FROM "Patient" WHERE "id" = ${id}
    `;
    return rows[0]?.identity ?? null;
  };

  const track = <T extends { id: string }>(row: T): T => {
    createdPatientIds.push(row.id);
    return row;
  };

  beforeAll(async () => {
    // A key made here rather than read from the environment, same reasoning
    // as `live-runs.integration.spec.ts`: the suite must not depend on the
    // developer's `.env`, and must not be able to open blobs a running
    // service could later write, or vice versa.
    cipher = new IdentityCipher(`it-${RUN}:${randomBytes(32).toString('base64')}`);
    patients = new PatientsService(prisma, cipher);
    purge = new PatientIdentityPurgeService(prisma);

    coordinatorRow = await prisma.user.create({
      data: {
        email: email('coordinator'),
        firstName: 'Coordinator',
        lastName: 'Test',
        roles: [UserRole.TRANSPORT_COORDINATOR],
        isActive: true,
      },
    });
    coordinatorUser = { id: coordinatorRow.id, roles: [UserRole.TRANSPORT_COORDINATOR] };
    managerOnlyUser = { id: coordinatorRow.id, roles: [] };

    municipality = await prisma.municipality.create({
      data: {
        ineCode: `PT-${RUN}`,
        name: `Campo ${RUN}`,
        district: `District ${RUN}`,
        latitude: 41.5923783,
        longitude: -8.6117829,
      },
    });
    locality = await prisma.locality.create({
      data: {
        name: 'Taveiro',
        searchName: foldForSearch('Taveiro'),
        municipalityId: municipality.id,
      },
    });
  });

  afterAll(async () => {
    await prisma.patient.deleteMany({ where: { id: { in: createdPatientIds } } });
    await prisma.municipality.deleteMany({ where: { district: `District ${RUN}` } });
    await prisma.user.deleteMany({ where: { id: coordinatorRow?.id } });
    await prisma.$disconnect();
  });

  describe('the identity column', () => {
    it('holds no plaintext at all', async () => {
      const created = track(
        await patients.create(
          { mobility: PatientMobility.AMBULATORY, identity: identityPayload() },
          coordinatorUser,
        ),
      );

      const blob = await rawIdentity(created.id);
      expect(blob).not.toBeNull();

      const bytes = Buffer.from(blob!);
      const asText = bytes.toString('utf8');
      const asLatin = bytes.toString('latin1');
      for (const secret of [PATIENT_NAME, '+351912345678', 'Rua do Castelo']) {
        expect(asText).not.toContain(secret);
        expect(asLatin).not.toContain(secret);
      }
    });

    it('comes back readable to a caller with VIEW_PATIENT_IDENTITY', async () => {
      const created = track(
        await patients.create(
          { mobility: PatientMobility.WHEELCHAIR, identity: identityPayload() },
          coordinatorUser,
        ),
      );

      const read = await patients.findOne(created.id, coordinatorUser);
      expect(read.identity?.fullName).toBe(PATIENT_NAME);
      expect(read.identityPurgedAt).toBeNull();
    });

    it('is bound to its own row, so a blob copied across refuses to open', async () => {
      const mine = track(
        await patients.create(
          { mobility: PatientMobility.AMBULATORY, identity: identityPayload() },
          coordinatorUser,
        ),
      );
      const theirs = track(
        await patients.create({ mobility: PatientMobility.AMBULATORY }, coordinatorUser),
      );

      const blob = await rawIdentity(mine.id);
      await prisma.$executeRaw`
        UPDATE "Patient" SET "identity" = ${blob} WHERE "id" = ${theirs.id}
      `;

      const read = await patients.findOne(theirs.id, coordinatorUser);
      expect(read.identity).toBeNull();
      expect(read.identityUnavailable).toBe(true);
    });
  });

  describe('VIEW_PATIENT_IDENTITY, asserted per endpoint', () => {
    it('is omitted from the detail route for a caller without it', async () => {
      const created = track(
        await patients.create(
          { mobility: PatientMobility.AMBULATORY, identity: identityPayload() },
          coordinatorUser,
        ),
      );

      const read = await patients.findOne(created.id, managerOnlyUser);
      expect(Object.prototype.hasOwnProperty.call(read, 'identity')).toBe(false);
    });

    it('is omitted from the list route too, not only the detail one', async () => {
      const created = track(
        await patients.create(
          { mobility: PatientMobility.AMBULATORY, identity: identityPayload() },
          coordinatorUser,
        ),
      );

      const page = await patients.findManaged(managerOnlyUser, 1, 200, true);
      const row = page.data.find((p) => p.id === created.id);
      expect(row).toBeDefined();
      expect(Object.prototype.hasOwnProperty.call(row!, 'identity')).toBe(false);
    });

    it('refuses a caller without it who tries to write identity', async () => {
      await expect(
        patients.create(
          { mobility: PatientMobility.AMBULATORY, identity: identityPayload() },
          managerOnlyUser,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('the unsealed profile', () => {
    it('rejects a coordinate given without its pair', async () => {
      await expect(
        patients.create(
          { mobility: PatientMobility.AMBULATORY, defaultLatitude: 40.2 },
          coordinatorUser,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('names a missing locality rather than leaking a foreign-key error', async () => {
      await expect(
        patients.create(
          { mobility: PatientMobility.AMBULATORY, localityId: 'loc-that-never-was' },
          coordinatorUser,
        ),
      ).rejects.toThrow(/locality/i);
    });

    it('persists mobility, coordinates and the locality relation', async () => {
      const created = track(
        await patients.create(
          {
            mobility: PatientMobility.STRETCHER,
            needsOxygen: true,
            defaultLatitude: 40.1976,
            defaultLongitude: -8.4392,
            localityId: locality.id,
          },
          coordinatorUser,
        ),
      );

      expect(created.mobility).toBe(PatientMobility.STRETCHER);
      expect(created.needsOxygen).toBe(true);
      expect(created.locality?.id).toBe(locality.id);
    });

    it('404s a patient that does not exist', async () => {
      await expect(patients.findOne('missing-patient', coordinatorUser)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('remove deletes the row outright', async () => {
      const created = await patients.create({ mobility: PatientMobility.AMBULATORY }, coordinatorUser);

      await patients.remove(created.id, coordinatorUser);

      await expect(patients.findOne(created.id, coordinatorUser)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('erasure and the purge sweep', () => {
    it('an explicit null on update stamps identityPurgedAt', async () => {
      const created = track(
        await patients.create(
          { mobility: PatientMobility.AMBULATORY, identity: identityPayload() },
          coordinatorUser,
        ),
      );

      const updated = await patients.update(created.id, { identity: null }, coordinatorUser);
      expect(updated.identity).toBeNull();
      expect(updated.identityPurgedAt).not.toBeNull();
      expect(await rawIdentity(created.id)).toBeNull();
    });

    it('the sweep destroys an untouched blob past the retention window, and the unsealed profile survives', async () => {
      const created = track(
        await patients.create(
          {
            mobility: PatientMobility.WHEELCHAIR,
            defaultLatitude: 40.1976,
            defaultLongitude: -8.4392,
            identity: identityPayload(),
          },
          coordinatorUser,
        ),
      );

      // Backdate `updatedAt` past any real retention window without waiting —
      // `@updatedAt` only stamps on an ORM write, so a raw UPDATE is the one
      // way to simulate "untouched for a year".
      const longAgo = new Date(Date.now() - 400 * 86_400_000);
      await prisma.$executeRaw`
        UPDATE "Patient" SET "updatedAt" = ${longAgo} WHERE "id" = ${created.id}
      `;

      const result = await purge.sweep();
      expect(result.purged).toBeGreaterThanOrEqual(1);

      const after = await patients.findOne(created.id, coordinatorUser);
      expect(after.identity).toBeNull();
      expect(after.identityPurgedAt).not.toBeNull();
      // Still plans: id, mobility profile and coordinates survive the purge.
      expect(after.mobility).toBe(PatientMobility.WHEELCHAIR);
      expect(after.defaultLatitude).toBe(40.1976);
      expect(after.defaultLongitude).toBe(-8.4392);
    });
  });
});
