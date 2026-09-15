import { ConflictException, NotFoundException } from '@nestjs/common';
import { CertificationType } from '@redinfo/shared';
import { TripCrewService } from './trip-crew.service';

// ── Crew assignment (#234) ──────────────────────────────────────────────────
//
// Follows the same override precedent as `ScheduleAssignment` and
// `VehicleOccupancy`: adding someone absent on the trip's date throws unless
// an override reason is supplied in the same call.

function buildPrismaStub(overrides: Record<string, unknown> = {}) {
  return {
    trip: { findUnique: jest.fn().mockResolvedValue({ id: 'trip-1', date: new Date('2026-09-15T00:00:00.000Z') }) },
    tripCrewMember: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest
        .fn()
        .mockImplementation((args) => Promise.resolve({ id: 'cm1', createdAt: new Date(), ...args.data })),
      delete: jest.fn().mockResolvedValue(undefined),
    },
    ...overrides,
  };
}

function makeService(prisma: ReturnType<typeof buildPrismaStub>, findOverlapping = jest.fn().mockResolvedValue([])) {
  const staffAbsences = { findOverlapping };
  return new TripCrewService(prisma as never, staffAbsences as never);
}

describe('TripCrewService', () => {
  describe('add', () => {
    it('404s for an unknown trip', async () => {
      const prisma = buildPrismaStub({ trip: { findUnique: jest.fn().mockResolvedValue(null) } });
      const service = makeService(prisma);
      await expect(service.add('nope', { userId: 'u1', role: CertificationType.DRIVER })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('adds a free crew member without needing an override', async () => {
      const prisma = buildPrismaStub();
      const service = makeService(prisma);
      const result = await service.add('trip-1', { userId: 'u1', role: CertificationType.DRIVER });
      expect(result).toMatchObject({ userId: 'u1', overrideReason: null });
    });

    it('rejects a crew member already on this trip', async () => {
      const prisma = buildPrismaStub({
        tripCrewMember: { findUnique: jest.fn().mockResolvedValue({ id: 'cm1' }), create: jest.fn() },
      });
      const service = makeService(prisma);
      await expect(service.add('trip-1', { userId: 'u1', role: CertificationType.DRIVER })).rejects.toThrow(
        ConflictException,
      );
    });

    it('rejects an absent crew member with no override reason', async () => {
      const prisma = buildPrismaStub();
      const service = makeService(prisma, jest.fn().mockResolvedValue([{ userId: 'u1' }]));
      await expect(service.add('trip-1', { userId: 'u1', role: CertificationType.DRIVER })).rejects.toThrow(
        ConflictException,
      );
    });

    it('accepts an absent crew member with a recorded override reason', async () => {
      const prisma = buildPrismaStub();
      const service = makeService(prisma, jest.fn().mockResolvedValue([{ userId: 'u1' }]));
      const result = await service.add('trip-1', {
        userId: 'u1',
        role: CertificationType.DRIVER,
        overrideReason: 'Asked to come in despite requested day off',
      });
      expect(result.overrideReason).toBe('Asked to come in despite requested day off');
    });
  });

  describe('remove', () => {
    it('404s when the crew member does not belong to this trip', async () => {
      const prisma = buildPrismaStub({
        tripCrewMember: { findUnique: jest.fn().mockResolvedValue({ id: 'cm1', tripId: 'other-trip' }) },
      });
      const service = makeService(prisma);
      await expect(service.remove('trip-1', 'cm1')).rejects.toThrow(NotFoundException);
    });

    it('removes a crew member belonging to this trip', async () => {
      const prisma = buildPrismaStub({
        tripCrewMember: {
          findUnique: jest.fn().mockResolvedValue({ id: 'cm1', tripId: 'trip-1' }),
          delete: jest.fn().mockResolvedValue(undefined),
        },
      });
      const service = makeService(prisma);
      await service.remove('trip-1', 'cm1');
      expect(prisma.tripCrewMember.delete).toHaveBeenCalledWith({ where: { id: 'cm1' } });
    });
  });
});
