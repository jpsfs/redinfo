import { INEM_AVAILABLE_INOP_CODE } from '@redinfo/shared';
import { InemSessionExpiredError } from './inem-api.client';
import { InemReconcilerService } from './inem-reconciler.service';

const COOKIES = { alAuth: 'a1', samlsessionid: 's1', deviceId: null };

function unitRow(overrides: Record<string, unknown> = {}) {
  return {
    unitId: 'CVCAMPO1',
    desiredInopCode: null,
    reportedInopCode: '00',
    ...overrides,
  };
}

function buildPrismaStub(existingUnits: ReturnType<typeof unitRow>[] = []) {
  const stub = {
    vehicle: { findUnique: jest.fn().mockResolvedValue({ id: 'v1' }) },
    iNEMUnit: {
      upsert: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue(existingUnits),
      update: jest.fn().mockResolvedValue({}),
    },
    $executeRaw: jest.fn().mockResolvedValue(0),
    $transaction: jest.fn().mockImplementation((fn: (tx: unknown) => unknown) => fn(stub)),
  };
  return stub;
}

function buildClientStub(overrides: Record<string, unknown> = {}) {
  return {
    getUnits: jest.fn().mockResolvedValue([
      {
        StationName: null,
        Station: 'CVCAMPO',
        UnitID: 'CVCAMPO1',
        CarID: '80PS45',
        DeviceID: null,
        DeviceAlias: null,
        Active: 'Operacional',
        INOPReason: null,
        UnitType: 'AMBRES',
      },
    ]),
    getInopReasons: jest.fn().mockResolvedValue({ TEPH_Falta: 'Sem Tripulação' }),
    putUnits: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function buildSessionStub(overrides: Record<string, unknown> = {}) {
  return {
    isEnabled: true,
    entityId: 'CVCAMPO',
    getCookiesOrNull: jest.fn().mockResolvedValue(COOKIES),
    setCachedInopReasons: jest.fn(),
    recover: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('InemReconcilerService', () => {
  const queue = { work: jest.fn().mockResolvedValue(undefined) };

  it('does nothing when the feature is disabled', async () => {
    const prisma = buildPrismaStub();
    const client = buildClientStub();
    const session = buildSessionStub({ isEnabled: false });
    const service = new InemReconcilerService(prisma as never, client as never, session as never, queue as never);

    await service.reconcile();

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(client.getUnits).not.toHaveBeenCalled();
  });

  it('asks for recovery, outside the transaction, when there is no usable session', async () => {
    const prisma = buildPrismaStub();
    const client = buildClientStub();
    const session = buildSessionStub({ getCookiesOrNull: jest.fn().mockResolvedValue(null) });
    const service = new InemReconcilerService(prisma as never, client as never, session as never, queue as never);

    await service.reconcile();

    expect(client.getUnits).not.toHaveBeenCalled();
    expect(session.recover).toHaveBeenCalledTimes(1);
  });

  it('upserts units from GET /api/unit, joining to the vehicle by CarID', async () => {
    const prisma = buildPrismaStub();
    const client = buildClientStub();
    const session = buildSessionStub();
    const service = new InemReconcilerService(prisma as never, client as never, session as never, queue as never);

    await service.reconcile();

    expect(prisma.vehicle.findUnique).toHaveBeenCalledWith({
      where: { licensePlate: '80PS45' },
      select: { id: true },
    });
    expect(prisma.iNEMUnit.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { unitId: 'CVCAMPO1' },
        create: expect.objectContaining({ vehicleId: 'v1', reportedInopCode: INEM_AVAILABLE_INOP_CODE }),
        update: expect.objectContaining({ vehicleId: 'v1', reportedInopCode: INEM_AVAILABLE_INOP_CODE }),
      }),
    );
  });

  it('caches the live INOP reason map for GET /inem/status to serve', async () => {
    const prisma = buildPrismaStub();
    const client = buildClientStub();
    const session = buildSessionStub();
    const service = new InemReconcilerService(prisma as never, client as never, session as never, queue as never);

    await service.reconcile();

    expect(session.setCachedInopReasons).toHaveBeenCalledWith({ TEPH_Falta: 'Sem Tripulação' });
  });

  it('pushes only units whose desired state diverges from reported, and never a null desired state', async () => {
    const prisma = buildPrismaStub([
      unitRow({ unitId: 'CVCAMPO1', desiredInopCode: 'TEPH_Falta', reportedInopCode: '00' }),
      unitRow({ unitId: 'CVCAMPO2', desiredInopCode: '00', reportedInopCode: '00' }), // already in sync
      unitRow({ unitId: 'CVCAMPO3', desiredInopCode: null, reportedInopCode: 'Alimentacao' }), // never set
    ]);
    const client = buildClientStub();
    const session = buildSessionStub();
    const service = new InemReconcilerService(prisma as never, client as never, session as never, queue as never);

    await service.reconcile();

    expect(client.putUnits).toHaveBeenCalledWith(COOKIES, 'CVCAMPO', { CVCAMPO1: { INOP: 'TEPH_Falta' } });
  });

  it('optimistically marks pushed units as synced', async () => {
    const prisma = buildPrismaStub([unitRow({ unitId: 'CVCAMPO1', desiredInopCode: 'TEPH_Falta', reportedInopCode: '00' })]);
    const client = buildClientStub();
    const session = buildSessionStub();
    const service = new InemReconcilerService(prisma as never, client as never, session as never, queue as never);

    await service.reconcile();

    expect(prisma.iNEMUnit.update).toHaveBeenCalledWith({
      where: { unitId: 'CVCAMPO1' },
      data: { reportedInopCode: 'TEPH_Falta', lastSyncedAt: expect.any(Date) },
    });
  });

  it('does not push anything when nothing diverges', async () => {
    const prisma = buildPrismaStub([unitRow({ unitId: 'CVCAMPO1', desiredInopCode: '00', reportedInopCode: '00' })]);
    const client = buildClientStub();
    const session = buildSessionStub();
    const service = new InemReconcilerService(prisma as never, client as never, session as never, queue as never);

    await service.reconcile();

    expect(client.putUnits).not.toHaveBeenCalled();
  });

  it('asks for recovery when the session dies mid-pass, and does not throw', async () => {
    const prisma = buildPrismaStub();
    const client = buildClientStub({ getUnits: jest.fn().mockRejectedValue(new InemSessionExpiredError('/api/unit')) });
    const session = buildSessionStub();
    const service = new InemReconcilerService(prisma as never, client as never, session as never, queue as never);

    await expect(service.reconcile()).resolves.toBeUndefined();
    expect(session.recover).toHaveBeenCalledTimes(1);
  });

  it('lets a genuinely unexpected error propagate rather than swallowing it as recoverable', async () => {
    const prisma = buildPrismaStub();
    const client = buildClientStub({ getUnits: jest.fn().mockRejectedValue(new Error('network down')) });
    const session = buildSessionStub();
    const service = new InemReconcilerService(prisma as never, client as never, session as never, queue as never);

    await expect(service.reconcile()).rejects.toThrow('network down');
    expect(session.recover).not.toHaveBeenCalled();
  });
});
