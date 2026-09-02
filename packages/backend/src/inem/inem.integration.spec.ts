import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { INEM_AVAILABLE_INOP_CODE } from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { IdentityCipher } from '../common/identity-cipher';
import { InemApiClient, InemCookieJar } from './inem-api.client';
import { InemReconcilerService } from './inem-reconciler.service';
import { InemService } from './inem.service';
import { InemSessionService } from './inem-session.service';

/**
 * Integration coverage for the INEM module (#214), against a real Postgres.
 *
 * What only a real database can answer, and is therefore here: that the
 * `INEMSession`/`OWASession` singleton rows are pre-seeded and the "exactly
 * one row" CHECK from the migration actually fires, that a cookie jar
 * survives a real round trip through the `Bytes` column and `IdentityCipher`,
 * that `pg_advisory_xact_lock` really does serialize two overlapping
 * transactions, and that the reconciler's vehicle join and status write
 * happen the same way against real tables as they do against mocked ones.
 */
const describeIntegration = process.env.DATABASE_URL ? describe : describe.skip;

const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

describeIntegration('INEM integration', () => {
  const prisma = new PrismaClient() as unknown as PrismaService;
  let cipher: IdentityCipher;

  let actor: { id: string };
  let vehicle: { id: string; licensePlate: string };
  const createdUnitIds: string[] = [];
  const nextUnitId = () => {
    const id = `IT-UNIT-${RUN}-${createdUnitIds.length}`;
    createdUnitIds.push(id);
    return id;
  };

  beforeAll(async () => {
    cipher = new IdentityCipher(`it-${RUN}:${randomBytes(32).toString('base64')}`);

    actor = await prisma.user.create({
      data: {
        email: `crew.${RUN}@inem.test`,
        firstName: 'Crew',
        lastName: 'Member',
        roles: ['EMERGENCY_COORDINATOR'],
        isActive: true,
      },
    });
    vehicle = await prisma.vehicle.create({
      data: {
        licensePlate: `IN-${RUN}`,
        numeroCauda: `IN-${RUN}`,
        vehicleType: 'EMERGENCY',
        insuranceRenewalDate: new Date('2045-01-01T00:00:00.000Z'),
        nextImtInspectionDate: new Date('2045-01-01T00:00:00.000Z'),
      },
    });
  });

  afterAll(async () => {
    if (createdUnitIds.length) {
      await prisma.iNEMStatusAudit.deleteMany({ where: { unitId: { in: createdUnitIds } } });
      await prisma.iNEMUnit.deleteMany({ where: { unitId: { in: createdUnitIds } } });
    }
    await prisma.vehicle.deleteMany({ where: { id: vehicle?.id } });
    await prisma.user.deleteMany({ where: { id: actor?.id } });
    await prisma.$disconnect();
  });

  it('pre-seeds exactly one INEMSession and one OWASession row', async () => {
    const session = await prisma.iNEMSession.findUniqueOrThrow({ where: { id: 'inem' } });
    const owa = await prisma.oWASession.findUniqueOrThrow({ where: { id: 'owa' } });
    expect(session.id).toBe('inem');
    expect(owa.id).toBe('owa');
  });

  it("refuses a second INEMSession row — the CHECK isn't just a comment", async () => {
    await expect(
      prisma.$executeRaw`INSERT INTO "INEMSession" ("id", "status", "failureCount", "updatedAt")
        VALUES ('inem-2', 'UNKNOWN', 0, CURRENT_TIMESTAMP)`,
    ).rejects.toThrow();
  });

  it('round-trips a sealed cookie jar through the real Bytes column', async () => {
    const cookies: InemCookieJar = { alAuth: `a-${RUN}`, samlsessionid: `s-${RUN}`, deviceId: null };
    const sealed = cipher.seal('inem-session', 'inem', cookies);

    await prisma.iNEMSession.update({ where: { id: 'inem' }, data: { cookies: sealed } });
    const row = await prisma.iNEMSession.findUniqueOrThrow({ where: { id: 'inem' } });

    expect(row.cookies).not.toBeNull();
    const opened = cipher.open<InemCookieJar>('inem-session', 'inem', Buffer.from(row.cookies as Buffer));
    expect(opened).toEqual(cookies);

    // Leave the row clean for anything that runs after this suite.
    await prisma.iNEMSession.update({ where: { id: 'inem' }, data: { cookies: null, status: 'UNKNOWN' } });
  });

  it('serializes two overlapping transactions on the same advisory lock key', async () => {
    let secondAcquiredAt = 0;
    let firstReleasedAt = 0;

    const first = prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('inem-session-recover-it')::bigint)`;
      await new Promise((resolve) => setTimeout(resolve, 200));
      firstReleasedAt = Date.now();
    });

    // Gives the first transaction a head start so it acquires the lock first.
    await new Promise((resolve) => setTimeout(resolve, 20));

    const second = prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('inem-session-recover-it')::bigint)`;
      secondAcquiredAt = Date.now();
    });

    await Promise.all([first, second]);
    expect(secondAcquiredAt).toBeGreaterThanOrEqual(firstReleasedAt);
  });

  describe('InemService against a real database', () => {
    it('writes desiredInopCode and an audit row in one transaction, then reflects it via getStatusOverview', async () => {
      const id = nextUnitId();
      await prisma.iNEMUnit.create({
        data: { unitId: id, carId: vehicle.licensePlate, vehicleId: vehicle.id, reportedInopCode: '00' },
      });
      const session = { getOverview: async () => ({ status: 'ACTIVE' as const, lastError: null }), getCachedInopReasons: () => null };
      const service = new InemService(prisma, session as unknown as InemSessionService);

      await service.setUnitStatus({ id: actor.id }, id, 'TEPH_Falta');

      const overview = await service.getStatusOverview();
      const unit = overview.units.find((u) => u.unitId === id);
      expect(unit?.desiredInopCode).toBe('TEPH_Falta');
      expect(unit?.vehicle).toMatchObject({ id: vehicle.id, licensePlate: vehicle.licensePlate });

      const audits = await prisma.iNEMStatusAudit.findMany({ where: { unitId: id } });
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({ userId: actor.id, inopCode: 'TEPH_Falta' });
    });
  });

  describe('InemReconcilerService against a real database', () => {
    it('upserts a unit from GET /api/unit and joins it to the vehicle by CarID', async () => {
      const id = nextUnitId();
      const client = {
        getUnits: async () => [
          {
            StationName: null,
            Station: 'CVCAMPO',
            UnitID: id,
            CarID: vehicle.licensePlate,
            DeviceID: null,
            DeviceAlias: null,
            Active: 'Operacional',
            INOPReason: null,
            UnitType: 'AMBRES',
          },
        ],
        getInopReasons: async () => ({}),
        putUnits: async () => undefined,
      };
      const session = {
        isEnabled: true,
        entityId: 'CVCAMPO',
        getCookiesOrNull: async () => ({ alAuth: 'a', samlsessionid: null, deviceId: null }) as InemCookieJar,
        setCachedInopReasons: () => undefined,
        recover: async () => undefined,
      };
      const queue = { work: async () => undefined };
      const reconciler = new InemReconcilerService(
        prisma,
        client as unknown as InemApiClient,
        session as unknown as InemSessionService,
        queue as never,
      );

      await reconciler.reconcile();

      const row = await prisma.iNEMUnit.findUniqueOrThrow({ where: { unitId: id } });
      expect(row.vehicleId).toBe(vehicle.id);
      expect(row.reportedInopCode).toBe(INEM_AVAILABLE_INOP_CODE);
    });
  });
});
