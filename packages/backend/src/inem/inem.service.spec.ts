import { INEMSessionStatus } from '@prisma/client';
import { INEM_INOP_REASONS } from '@redinfo/shared';
import { InemService } from './inem.service';

const ACTOR = { id: 'u-ana' };

function unitRow(overrides: Record<string, unknown> = {}) {
  return {
    unitId: 'CVCAMPO1',
    station: 'CVCAMPO',
    carId: '80PS45',
    unitType: 'AMBRES',
    desiredInopCode: null,
    reportedInopCode: '00',
    reportedActive: 'Operacional',
    lastSyncedAt: new Date('2026-09-02T10:00:00.000Z'),
    lastError: null,
    vehicle: { id: 'v1', licensePlate: '80PS45', numeroCauda: 'C1' },
    ...overrides,
  };
}

function buildPrismaStub(units = [unitRow()]) {
  const stub = {
    iNEMUnit: {
      findMany: jest.fn().mockResolvedValue(units),
      findUnique: jest.fn().mockImplementation(({ where: { unitId } }) =>
        Promise.resolve(units.find((u) => u.unitId === unitId) ?? null),
      ),
      update: jest.fn().mockResolvedValue({}),
    },
    iNEMStatusAudit: { create: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn().mockImplementation((ops: unknown[]) => Promise.all(ops)),
  };
  return stub;
}

function buildSessionStub(overrides: Record<string, unknown> = {}) {
  return {
    getOverview: jest.fn().mockResolvedValue({ status: INEMSessionStatus.ACTIVE, lastError: null }),
    getCachedInopReasons: jest.fn().mockReturnValue(null),
    ...overrides,
  };
}

describe('InemService', () => {
  describe('getStatusOverview', () => {
    it('joins units to their vehicle and reports session status', async () => {
      const prisma = buildPrismaStub();
      const session = buildSessionStub();
      const service = new InemService(prisma as never, session as never);

      const overview = await service.getStatusOverview();

      expect(overview.sessionStatus).toBe(INEMSessionStatus.ACTIVE);
      expect(overview.units).toHaveLength(1);
      expect(overview.units[0]).toMatchObject({
        unitId: 'CVCAMPO1',
        vehicle: { id: 'v1', licensePlate: '80PS45' },
        lastSyncedAt: '2026-09-02T10:00:00.000Z',
      });
    });

    it('falls back to the compile-time INOP reason map when nothing has been cached yet', async () => {
      const prisma = buildPrismaStub();
      const session = buildSessionStub({ getCachedInopReasons: jest.fn().mockReturnValue(null) });
      const service = new InemService(prisma as never, session as never);

      const overview = await service.getStatusOverview();
      expect(overview.inopReasons).toEqual(INEM_INOP_REASONS);
    });

    it('prefers the live-cached reason map once one exists', async () => {
      const prisma = buildPrismaStub();
      const live = { TEPH_Falta: 'Sem Tripulação', NEW_CODE: 'Something new' };
      const session = buildSessionStub({ getCachedInopReasons: jest.fn().mockReturnValue(live) });
      const service = new InemService(prisma as never, session as never);

      const overview = await service.getStatusOverview();
      expect(overview.inopReasons).toEqual(live);
    });

    it('reports a unit INEM lists but redinfo has no matching vehicle for as vehicle: null', async () => {
      const prisma = buildPrismaStub([unitRow({ vehicle: null, carId: 'UNKNOWN1' })]);
      const session = buildSessionStub();
      const service = new InemService(prisma as never, session as never);

      const overview = await service.getStatusOverview();
      expect(overview.units[0].vehicle).toBeNull();
    });
  });

  describe('setUnitStatus', () => {
    it('writes desiredInopCode and an audit row in one transaction', async () => {
      const prisma = buildPrismaStub();
      const session = buildSessionStub();
      const service = new InemService(prisma as never, session as never);

      await service.setUnitStatus(ACTOR, 'CVCAMPO1', 'TEPH_Falta');

      expect(prisma.iNEMUnit.update).toHaveBeenCalledWith({
        where: { unitId: 'CVCAMPO1' },
        data: { desiredInopCode: 'TEPH_Falta' },
      });
      expect(prisma.iNEMStatusAudit.create).toHaveBeenCalledWith({
        data: { unitId: 'CVCAMPO1', userId: ACTOR.id, inopCode: 'TEPH_Falta' },
      });
    });

    it('never calls INEM directly — the reconciler does the pushing', async () => {
      const prisma = buildPrismaStub();
      const session = buildSessionStub();
      const service = new InemService(prisma as never, session as never);

      await service.setUnitStatus(ACTOR, 'CVCAMPO1', '00');
      // No method on `session` beyond the read-only status check was touched.
      expect(session.getOverview).toHaveBeenCalled();
    });

    it('rejects with INEM_SESSION_NOT_ACTIVE once the circuit breaker has tripped', async () => {
      const prisma = buildPrismaStub();
      const session = buildSessionStub({
        getOverview: jest.fn().mockResolvedValue({ status: INEMSessionStatus.FAILED, lastError: 'boom' }),
      });
      const service = new InemService(prisma as never, session as never);

      await expect(service.setUnitStatus(ACTOR, 'CVCAMPO1', '00')).rejects.toMatchObject({
        code: 'INEM_SESSION_NOT_ACTIVE',
      });
      expect(prisma.iNEMUnit.update).not.toHaveBeenCalled();
    });

    it('404s for a unit id INEM has never reported', async () => {
      const prisma = buildPrismaStub([]);
      const session = buildSessionStub();
      const service = new InemService(prisma as never, session as never);

      await expect(service.setUnitStatus(ACTOR, 'GHOST1', '00')).rejects.toThrow('GHOST1');
    });
  });
});
