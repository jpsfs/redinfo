import { ConflictException } from '@nestjs/common';
import { VehicleOccupancyService } from './vehicle-occupancy.service';
import { VehicleOccupancySource } from '@redinfo/shared';

// ── helpers ────────────────────────────────────────────────────────────────────

function buildPrismaStub(overrides: Record<string, unknown> = {}) {
  return {
    vehicleOccupancy: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((args) => Promise.resolve({ id: 'vo1', ...args.data })),
      update: jest.fn().mockImplementation((args) => Promise.resolve({ id: args.where.id, ...args.data })),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    ...overrides,
  };
}

const interval = { startsAt: new Date('2026-09-15T08:00:00.000Z'), endsAt: new Date('2026-09-15T16:00:00.000Z') };

// ── VehicleOccupancyService unit tests ──────────────────────────────────────────

describe('VehicleOccupancyService', () => {
  let service: VehicleOccupancyService;
  let prisma: ReturnType<typeof buildPrismaStub>;

  beforeEach(() => {
    prisma = buildPrismaStub();
    service = new VehicleOccupancyService(prisma as never);
  });

  describe('findInRange', () => {
    it('queries overlap on [from, to) and orders by startsAt', async () => {
      await service.findInRange(interval.startsAt, interval.endsAt, 'v1');
      expect(prisma.vehicleOccupancy.findMany).toHaveBeenCalledWith({
        where: { vehicleId: 'v1', startsAt: { lt: interval.endsAt }, endsAt: { gt: interval.startsAt } },
        orderBy: { startsAt: 'asc' },
      });
    });

    it('omits the vehicleId filter when none is given', async () => {
      await service.findInRange(interval.startsAt, interval.endsAt);
      const [call] = prisma.vehicleOccupancy.findMany.mock.calls;
      expect(call[0].where).not.toHaveProperty('vehicleId');
    });
  });

  describe('findConflicts', () => {
    it('excludes the given id when checking for overlaps', async () => {
      await service.findConflicts('v1', interval.startsAt, interval.endsAt, 'self-id');
      const [call] = prisma.vehicleOccupancy.findMany.mock.calls;
      expect(call[0].where.NOT).toEqual({ id: 'self-id' });
    });
  });

  describe('book', () => {
    it('creates the interval when there is no conflict', async () => {
      const result = await service.book({
        vehicleId: 'v1',
        ...interval,
        source: VehicleOccupancySource.SCHEDULE_SHIFT,
        sourceId: 'assignment-1',
      });
      expect(result).toMatchObject({ vehicleId: 'v1', source: VehicleOccupancySource.SCHEDULE_SHIFT });
      expect(prisma.vehicleOccupancy.create).toHaveBeenCalledTimes(1);
    });

    it('rejects an overlapping booking without an overrideReason', async () => {
      prisma.vehicleOccupancy.findMany.mockResolvedValue([{ id: 'existing' }]);
      await expect(
        service.book({
          vehicleId: 'v1',
          ...interval,
          source: VehicleOccupancySource.SCHEDULE_SHIFT,
          sourceId: 'assignment-1',
        }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.vehicleOccupancy.create).not.toHaveBeenCalled();
    });

    it('accepts an overlapping booking with an overrideReason, and persists it', async () => {
      prisma.vehicleOccupancy.findMany.mockResolvedValue([{ id: 'existing' }]);
      const result = await service.book({
        vehicleId: 'v1',
        ...interval,
        source: VehicleOccupancySource.SCHEDULE_SHIFT,
        sourceId: 'assignment-1',
        overrideReason: 'Coordinator approved double-booking for the drill',
      });
      expect(result.overrideReason).toBe('Coordinator approved double-booking for the drill');
    });
  });

  describe('syncForSource', () => {
    it('creates a new interval when none exists yet for the source row', async () => {
      await service.syncForSource(VehicleOccupancySource.MAINTENANCE, 'me1', {
        vehicleId: 'v1',
        ...interval,
      });
      expect(prisma.vehicleOccupancy.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          source: VehicleOccupancySource.MAINTENANCE,
          sourceId: 'me1',
          vehicleId: 'v1',
        }),
      });
    });

    it('updates the existing interval in place instead of duplicating it', async () => {
      prisma.vehicleOccupancy.findFirst.mockResolvedValue({ id: 'vo1' });
      await service.syncForSource(VehicleOccupancySource.MAINTENANCE, 'me1', {
        vehicleId: 'v1',
        ...interval,
      });
      expect(prisma.vehicleOccupancy.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'vo1' } }),
      );
      expect(prisma.vehicleOccupancy.create).not.toHaveBeenCalled();
    });
  });

  describe('rebookForSource', () => {
    it('creates a new interval when none exists yet, with no conflicts', async () => {
      const result = await service.rebookForSource(VehicleOccupancySource.TRANSPORT_TRIP, 'trip1', {
        vehicleId: 'v1',
        ...interval,
      });
      expect(prisma.vehicleOccupancy.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ source: VehicleOccupancySource.TRANSPORT_TRIP, sourceId: 'trip1' }),
      });
      expect(result).toBeDefined();
    });

    it('updates the existing interval in place, excluding itself from the conflict check', async () => {
      prisma.vehicleOccupancy.findFirst.mockResolvedValue({ id: 'vo1' });
      await service.rebookForSource(VehicleOccupancySource.TRANSPORT_TRIP, 'trip1', { vehicleId: 'v1', ...interval });
      expect(prisma.vehicleOccupancy.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ NOT: { id: 'vo1' } }) }),
      );
      expect(prisma.vehicleOccupancy.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'vo1' } }));
      expect(prisma.vehicleOccupancy.create).not.toHaveBeenCalled();
    });

    it('rejects an overlapping window without an overrideReason', async () => {
      prisma.vehicleOccupancy.findMany.mockResolvedValue([{ id: 'other' }]);
      await expect(
        service.rebookForSource(VehicleOccupancySource.TRANSPORT_TRIP, 'trip1', { vehicleId: 'v1', ...interval }),
      ).rejects.toThrow(ConflictException);
    });

    it('accepts an overlapping window with an overrideReason, and persists it', async () => {
      prisma.vehicleOccupancy.findMany.mockResolvedValue([{ id: 'other' }]);
      const result = await service.rebookForSource(
        VehicleOccupancySource.TRANSPORT_TRIP,
        'trip1',
        { vehicleId: 'v1', ...interval },
        'Overlap accepted, short handover window',
      );
      expect(result.overrideReason).toBe('Overlap accepted, short handover window');
    });
  });

  describe('removeForSource', () => {
    it('deletes every interval matching the source row', async () => {
      await service.removeForSource(VehicleOccupancySource.MAINTENANCE, 'me1');
      expect(prisma.vehicleOccupancy.deleteMany).toHaveBeenCalledWith({
        where: { source: VehicleOccupancySource.MAINTENANCE, sourceId: 'me1' },
      });
    });
  });
});
