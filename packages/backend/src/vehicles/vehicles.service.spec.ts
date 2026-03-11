import { ConflictException, NotFoundException } from '@nestjs/common';
import { VehiclesService } from './vehicles.service';
import { VehicleType } from '@redinfo/shared';

// ── helpers ────────────────────────────────────────────────────────────────────

const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
const tomorrowStr = tomorrow.toISOString().slice(0, 10);

const farFuture = '2099-12-31';

function makeVehicleDto(overrides: Partial<{
  licensePlate: string;
  numeroCauda: string;
  vehicleType: VehicleType;
  insuranceRenewalDate: string;
  nextImtInspectionDate: string;
}> = {}) {
  return {
    licensePlate: overrides.licensePlate ?? '55-AA-12',
    numeroCauda: overrides.numeroCauda ?? 'VIAT-01',
    vehicleType: overrides.vehicleType ?? VehicleType.EMERGENCY,
    insuranceRenewalDate: overrides.insuranceRenewalDate ?? farFuture,
    nextImtInspectionDate: overrides.nextImtInspectionDate ?? farFuture,
  };
}

function buildPrismaStub(overrides: Record<string, unknown> = {}) {
  return {
    vehicle: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((args) => Promise.resolve({ id: 'v1', ...args.data })),
      update: jest.fn().mockImplementation((args) => Promise.resolve({ id: args.where.id, ...args.data })),
      count: jest.fn().mockResolvedValue(0),
    },
    maintenanceEntry: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((args) => Promise.resolve({ id: 'me1', ...args.data })),
      update: jest.fn().mockImplementation((args) => Promise.resolve({ id: args.where.id, ...args.data })),
      delete: jest.fn().mockResolvedValue({ id: 'me1' }),
      count: jest.fn().mockResolvedValue(0),
    },
    $transaction: jest.fn().mockImplementation((ops: unknown[]) => Promise.all(ops)),
    ...overrides,
  };
}

// ── VehiclesService unit tests ─────────────────────────────────────────────────

describe('VehiclesService', () => {
  let service: VehiclesService;
  let prisma: ReturnType<typeof buildPrismaStub>;

  beforeEach(() => {
    prisma = buildPrismaStub();
    service = new VehiclesService(prisma as never);
  });

  // ── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates a vehicle and uppercases the licence plate', async () => {
      const dto = makeVehicleDto({ licensePlate: '55-aa-12' });
      const result = await service.create(dto);
      expect(result.licensePlate).toBe('55-AA-12');
      expect(prisma.vehicle.create).toHaveBeenCalledTimes(1);
    });

    it('throws ConflictException when licence plate already exists', async () => {
      prisma.vehicle.findUnique
        .mockResolvedValueOnce({ id: 'existing' }) // plate check
        .mockResolvedValueOnce(null);               // cauda check
      const dto = makeVehicleDto();
      await expect(service.create(dto)).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when número de cauda already exists', async () => {
      prisma.vehicle.findUnique
        .mockResolvedValueOnce(null)                // plate check
        .mockResolvedValueOnce({ id: 'existing' }); // cauda check
      const dto = makeVehicleDto();
      await expect(service.create(dto)).rejects.toThrow(ConflictException);
    });
  });

  // ── findOne ─────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns the vehicle when found', async () => {
      prisma.vehicle.findFirst.mockResolvedValue({ id: 'v1', isDeleted: false });
      const result = await service.findOne('v1');
      expect(result).toMatchObject({ id: 'v1' });
    });

    it('throws NotFoundException when vehicle does not exist', async () => {
      prisma.vehicle.findFirst.mockResolvedValue(null);
      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ── remove (soft delete) ─────────────────────────────────────────────────────

  describe('remove', () => {
    it('soft-deletes by setting isDeleted=true', async () => {
      prisma.vehicle.findFirst.mockResolvedValue({ id: 'v1', isDeleted: false });
      await service.remove('v1');
      expect(prisma.vehicle.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isDeleted: true } }),
      );
    });
  });

  // ── findUpcoming ─────────────────────────────────────────────────────────────

  describe('findUpcoming', () => {
    it('calls findMany with isDeleted:false and a date threshold', async () => {
      prisma.vehicle.findMany.mockResolvedValue([]);
      await service.findUpcoming(30);
      const [call] = prisma.vehicle.findMany.mock.calls;
      expect(call[0].where.isDeleted).toBe(false);
      expect(call[0].where.OR).toBeDefined();
    });
  });

  // ── maintenance entries ───────────────────────────────────────────────────────

  describe('createEntry', () => {
    it('creates a maintenance entry for an existing vehicle', async () => {
      prisma.vehicle.findFirst.mockResolvedValue({ id: 'v1', isDeleted: false });
      const dto = {
        vehicleId: 'v1',
        date: '2025-03-01',
        description: 'Oil change',
        serviceProvider: 'Garagem Silva',
        cost: 150,
      };
      const result = await service.createEntry(dto);
      expect(result.vehicleId).toBe('v1');
    });

    it('throws NotFoundException when vehicle does not exist', async () => {
      prisma.vehicle.findFirst.mockResolvedValue(null);
      await expect(
        service.createEntry({
          vehicleId: 'missing',
          date: '2025-03-01',
          description: 'x',
          serviceProvider: 'x',
          cost: 0,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeEntry', () => {
    it('deletes the entry when it exists', async () => {
      prisma.maintenanceEntry.findUnique.mockResolvedValue({ id: 'me1' });
      await service.removeEntry('me1');
      expect(prisma.maintenanceEntry.delete).toHaveBeenCalledWith({ where: { id: 'me1' } });
    });

    it('throws NotFoundException when entry does not exist', async () => {
      prisma.maintenanceEntry.findUnique.mockResolvedValue(null);
      await expect(service.removeEntry('missing')).rejects.toThrow(NotFoundException);
    });
  });
});
