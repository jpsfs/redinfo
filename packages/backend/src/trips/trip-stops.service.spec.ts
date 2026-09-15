import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { LegStatus, PatientMobility, TripStopDwell, TripStopKind } from '@redinfo/shared';
import { TripStopsService } from './trip-stops.service';

// ── Stop sequence mutation (#234) ───────────────────────────────────────────
//
// Capacity is checked against the *candidate* stop set before anything is
// committed and never has an override; a `Trip`'s one `VehicleOccupancy`
// interval is recomputed after every write here, since it's a pure function
// of the current stops (see the shared `computeTripOccupancyWindow`).

const VEHICLE = { seatedCapacity: 3, wheelchairPositions: 1, stretcherPositions: 0 };

function tripStop(overrides: Record<string, unknown> = {}) {
  return {
    id: 'stop-1',
    tripId: 'trip-1',
    sequence: 1,
    kind: TripStopKind.PICKUP,
    transportLegId: null,
    facilityId: null,
    address: null,
    latitude: null,
    longitude: null,
    plannedAt: new Date('2026-09-15T08:00:00.000Z'),
    actualAt: null,
    dwellDecision: null,
    dwellMinutes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function leg(overrides: Record<string, unknown> = {}) {
  return {
    id: 'leg-1',
    status: LegStatus.PLANNED,
    originFacilityId: null,
    originAddress: '123 Main St',
    originLatitude: 41.5,
    originLongitude: -8.6,
    destinationFacilityId: 'fac-1',
    destinationAddress: null,
    destinationLatitude: 41.1,
    destinationLongitude: -8.1,
    ...overrides,
  };
}

function buildPrismaStub(overrides: Record<string, unknown> = {}) {
  return {
    trip: {
      findUnique: jest.fn().mockResolvedValue({ id: 'trip-1', vehicleId: 'v1', vehicle: VEHICLE }),
    },
    transportLeg: {
      findUnique: jest.fn().mockResolvedValue(leg()),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
    tripStop: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      delete: jest.fn().mockResolvedValue(undefined),
      create: jest
        .fn()
        .mockImplementation((args) =>
          Promise.resolve({ id: `new-${args.data.kind}`, createdAt: new Date(), updatedAt: new Date(), ...args.data }),
        ),
      update: jest.fn().mockImplementation((args) => Promise.resolve({ id: args.where.id, ...args.data })),
    },
    facility: { findUnique: jest.fn().mockResolvedValue({ id: 'fac-1', addressLine: 'Hospital St', latitude: 41.1, longitude: -8.1 }) },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    ...overrides,
  };
}

const BASE_SETTINGS = { baseName: 'Campo base', baseLatitude: 41.6, baseLongitude: -8.6 };

function makeService(prisma: ReturnType<typeof buildPrismaStub>, vehicleOccupancyOverrides: Record<string, unknown> = {}) {
  const delegationSettings = { get: jest.fn().mockResolvedValue(BASE_SETTINGS) };
  const vehicleOccupancy = {
    rebookForSource: jest.fn().mockResolvedValue(undefined),
    removeForSource: jest.fn().mockResolvedValue(undefined),
    ...vehicleOccupancyOverrides,
  };
  const service = new TripStopsService(prisma as never, delegationSettings as never, vehicleOccupancy as never);
  return { service, delegationSettings, vehicleOccupancy };
}

describe('TripStopsService', () => {
  describe('assignLegToTrip', () => {
    const dto = { transportLegId: 'leg-1', pickupPlannedAt: '2026-09-15T08:00:00.000Z', dropoffPlannedAt: '2026-09-15T08:30:00.000Z' };

    it('404s for an unknown trip', async () => {
      const prisma = buildPrismaStub({ trip: { findUnique: jest.fn().mockResolvedValue(null) } });
      const { service } = makeService(prisma);
      await expect(service.assignLegToTrip('nope', dto)).rejects.toThrow(NotFoundException);
    });

    it('404s for an unknown leg', async () => {
      const prisma = buildPrismaStub({ transportLeg: { findUnique: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) } });
      const { service } = makeService(prisma);
      await expect(service.assignLegToTrip('trip-1', dto)).rejects.toThrow(NotFoundException);
    });

    it('refuses a cancelled leg', async () => {
      const prisma = buildPrismaStub({
        transportLeg: { findUnique: jest.fn().mockResolvedValue(leg({ status: LegStatus.CANCELLED })), findMany: jest.fn().mockResolvedValue([]) },
      });
      const { service } = makeService(prisma);
      await expect(service.assignLegToTrip('trip-1', dto)).rejects.toThrow(ConflictException);
    });

    it('creates the PICKUP+DROPOFF pair appended after existing stops, and marks the leg ASSIGNED', async () => {
      const prisma = buildPrismaStub({
        tripStop: {
          findMany: jest.fn().mockImplementation(({ where }) =>
            Promise.resolve(where.transportLegId === 'leg-1' && !where.tripId ? [] : where.tripId ? [tripStop({ sequence: 3 })] : []),
          ),
          findUnique: jest.fn(),
          deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
          create: jest
            .fn()
            .mockImplementation((args) => Promise.resolve({ id: `new-${args.data.kind}`, createdAt: new Date(), updatedAt: new Date(), ...args.data })),
          update: jest.fn(),
          delete: jest.fn(),
        },
      });
      const { service, vehicleOccupancy } = makeService(prisma);
      const result = await service.assignLegToTrip('trip-1', dto);

      expect(result.pickup.sequence).toBe(4);
      expect(result.dropoff.sequence).toBe(5);
      expect(prisma.transportLeg.update).toHaveBeenCalledWith({
        where: { id: 'leg-1' },
        data: { status: LegStatus.ASSIGNED },
      });
      expect(vehicleOccupancy.rebookForSource).toHaveBeenCalled();
    });

    it('does not re-assign an already-ASSIGNED leg\'s status', async () => {
      const prisma = buildPrismaStub({
        transportLeg: { findUnique: jest.fn().mockResolvedValue(leg({ status: LegStatus.ASSIGNED })), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
      });
      const { service } = makeService(prisma);
      await service.assignLegToTrip('trip-1', dto);
      expect(prisma.transportLeg.update).not.toHaveBeenCalled();
    });

    it('rejects over capacity with no override, and commits nothing', async () => {
      const prisma = buildPrismaStub({
        trip: { findUnique: jest.fn().mockResolvedValue({ id: 'trip-1', vehicleId: 'v1', vehicle: { ...VEHICLE, wheelchairPositions: 0 } }) },
        tripStop: {
          findMany: jest.fn().mockResolvedValue([]),
          findUnique: jest.fn(),
          deleteMany: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
          delete: jest.fn(),
        },
        transportLeg: {
          findUnique: jest.fn().mockResolvedValue(leg()),
          findMany: jest.fn().mockResolvedValue([
            { id: 'leg-1', transportRequest: { escortTravels: false, patient: { mobility: PatientMobility.WHEELCHAIR } } },
          ]),
          update: jest.fn(),
        },
      });
      const { service } = makeService(prisma);
      await expect(service.assignLegToTrip('trip-1', dto)).rejects.toThrow(ConflictException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('recomputes occupancy for a previous trip the leg is moved away from', async () => {
      const prisma = buildPrismaStub({
        tripStop: {
          findMany: jest.fn().mockImplementation(({ where }) => {
            if (where.transportLegId === 'leg-1' && !where.tripId) return Promise.resolve([tripStop({ tripId: 'old-trip' })]);
            if (where.tripId === 'old-trip') return Promise.resolve([]);
            return Promise.resolve([]);
          }),
          findUnique: jest.fn(),
          deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
          create: jest
            .fn()
            .mockImplementation((args) => Promise.resolve({ id: `new-${args.data.kind}`, createdAt: new Date(), updatedAt: new Date(), ...args.data })),
          update: jest.fn(),
          delete: jest.fn(),
        },
      });
      const { service, vehicleOccupancy } = makeService(prisma);
      await service.assignLegToTrip('trip-1', dto);
      expect(vehicleOccupancy.removeForSource).toHaveBeenCalledWith('TRANSPORT_TRIP', 'old-trip');
    });
  });

  describe('unassignLeg', () => {
    it('404s when the leg has no stops on this trip', async () => {
      const prisma = buildPrismaStub();
      const { service } = makeService(prisma);
      await expect(service.unassignLeg('trip-1', 'leg-1')).rejects.toThrow(NotFoundException);
    });

    it('deletes the stops and reverts an ASSIGNED leg back to PLANNED', async () => {
      const prisma = buildPrismaStub({
        tripStop: { findMany: jest.fn().mockResolvedValue([tripStop(), tripStop({ id: 'stop-2', kind: TripStopKind.DROPOFF })]), deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
        transportLeg: { findUnique: jest.fn().mockResolvedValue(leg({ status: LegStatus.ASSIGNED })), update: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      });
      const { service, vehicleOccupancy } = makeService(prisma);
      await service.unassignLeg('trip-1', 'leg-1');
      expect(prisma.tripStop.deleteMany).toHaveBeenCalledWith({ where: { tripId: 'trip-1', transportLegId: 'leg-1' } });
      expect(prisma.transportLeg.update).toHaveBeenCalledWith({ where: { id: 'leg-1' }, data: { status: LegStatus.PLANNED } });
      expect(vehicleOccupancy.rebookForSource).toHaveBeenCalled();
    });
  });

  describe('addStop', () => {
    it('rejects a WAIT stop with no facilityId', async () => {
      const prisma = buildPrismaStub();
      const { service } = makeService(prisma);
      await expect(service.addStop('trip-1', { kind: TripStopKind.WAIT, plannedAt: '2026-09-15T10:00:00.000Z' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('creates a WAIT stop snapshotting the facility address/coordinates', async () => {
      const prisma = buildPrismaStub({ tripStop: { findMany: jest.fn().mockResolvedValue([tripStop()]), create: jest.fn().mockImplementation((args) => Promise.resolve({ id: 'wait-1', createdAt: new Date(), updatedAt: new Date(), ...args.data })) } });
      const { service } = makeService(prisma);
      const result = await service.addStop('trip-1', {
        kind: TripStopKind.WAIT,
        plannedAt: '2026-09-15T10:00:00.000Z',
        facilityId: 'fac-1',
        dwellDecision: TripStopDwell.WAIT,
        dwellMinutes: 90,
      });
      expect(result).toMatchObject({ sequence: 2, facilityId: 'fac-1', address: 'Hospital St', dwellMinutes: 90 });
    });

    it('creates a RETURN_TO_BASE stop defaulting address/coordinates from DelegationSettings', async () => {
      const prisma = buildPrismaStub({ tripStop: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockImplementation((args) => Promise.resolve({ id: 'rtb-1', createdAt: new Date(), updatedAt: new Date(), ...args.data })) } });
      const { service } = makeService(prisma);
      const result = await service.addStop('trip-1', { kind: TripStopKind.RETURN_TO_BASE, plannedAt: '2026-09-15T18:00:00.000Z' });
      expect(result).toMatchObject({ sequence: 1, address: 'Campo base', latitude: 41.6, longitude: -8.6, facilityId: null });
    });
  });

  describe('deleteStop', () => {
    it('refuses to delete a PICKUP stop directly', async () => {
      const prisma = buildPrismaStub({ tripStop: { findUnique: jest.fn().mockResolvedValue(tripStop({ kind: TripStopKind.PICKUP })) } });
      const { service } = makeService(prisma);
      await expect(service.deleteStop('trip-1', 'stop-1')).rejects.toThrow(ConflictException);
    });

    it('deletes a WAIT stop and re-syncs occupancy', async () => {
      const prisma = buildPrismaStub({
        tripStop: { findUnique: jest.fn().mockResolvedValue(tripStop({ kind: TripStopKind.WAIT })), delete: jest.fn().mockResolvedValue(undefined), findMany: jest.fn().mockResolvedValue([]) },
      });
      const { service, vehicleOccupancy } = makeService(prisma);
      await service.deleteStop('trip-1', 'stop-1');
      expect(prisma.tripStop.delete).toHaveBeenCalledWith({ where: { id: 'stop-1' } });
      expect(vehicleOccupancy.removeForSource).toHaveBeenCalled();
    });
  });

  describe('reorderStops', () => {
    it('rejects a stopIds list that is not exactly this trip\'s current stops', async () => {
      const prisma = buildPrismaStub({ tripStop: { findMany: jest.fn().mockResolvedValue([tripStop({ id: 's1' }), tripStop({ id: 's2' })]) } });
      const { service } = makeService(prisma);
      await expect(service.reorderStops('trip-1', { stopIds: ['s1'] })).rejects.toThrow(BadRequestException);
    });

    it('renumbers via a two-phase transaction', async () => {
      const stops = [tripStop({ id: 's1', sequence: 1 }), tripStop({ id: 's2', sequence: 2 })];
      const prisma = buildPrismaStub({
        tripStop: { findMany: jest.fn().mockResolvedValue(stops), update: jest.fn().mockImplementation((args) => Promise.resolve(args)) },
      });
      const { service } = makeService(prisma);
      await service.reorderStops('trip-1', { stopIds: ['s2', 's1'] });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const ops = (prisma.$transaction as jest.Mock).mock.calls[0][0];
      expect(ops).toHaveLength(4);
    });
  });
});
