import { ConflictException, NotFoundException } from '@nestjs/common';
import { CertificationType } from '@redinfo/shared';
import { TripCrewService } from './trip-crew.service';

// ── Crew assignment (#234, #235) ────────────────────────────────────────────
//
// Follows the same override precedent as `ScheduleAssignment` and
// `VehicleOccupancy`: adding someone absent on the trip's date throws unless
// an override reason is supplied in the same call.
//
// Crew *composition* (how many, holding what) is not tested here — it is
// never checked at write time, on purpose. See `checkTripCrew` in shared and
// its coverage in `trips.service.spec.ts`.

const TRIP = { id: 'trip-1', vehicleId: 'v1', date: new Date('2026-09-15T00:00:00.000Z') };

function buildPrismaStub(overrides: Record<string, unknown> = {}) {
  return {
    trip: {
      findUnique: jest.fn().mockResolvedValue(TRIP),
      findMany: jest.fn().mockResolvedValue([{ id: 'trip-1' }]),
    },
    tripCrewMember: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest
        .fn()
        .mockImplementation((args) => Promise.resolve({ id: `cm-${args.data.tripId}`, createdAt: new Date(), ...args.data })),
      delete: jest.fn().mockResolvedValue(undefined),
    },
    user: { findMany: jest.fn().mockResolvedValue([]) },
    scheduleAssignment: { findMany: jest.fn().mockResolvedValue([]) },
    // The real client hands `$transaction` an array of PrismaPromises; the
    // stubbed `create` already returns settled promises, so awaiting them all
    // is a faithful enough stand-in for the batch.
    $transaction: jest.fn().mockImplementation((operations: Promise<unknown>[]) => Promise.all(operations)),
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

    it('adds to this journey only by default', async () => {
      const prisma = buildPrismaStub({
        trip: {
          findUnique: jest.fn().mockResolvedValue(TRIP),
          findMany: jest.fn().mockResolvedValue([{ id: 'trip-1' }, { id: 'trip-2' }]),
        },
      });
      const service = makeService(prisma);
      await service.add('trip-1', { userId: 'u1', role: CertificationType.DRIVER });
      expect(prisma.tripCrewMember.create).toHaveBeenCalledTimes(1);
      expect(prisma.tripCrewMember.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tripId: 'trip-1' }) }),
      );
    });

    it("adds to every journey of the vehicle's day when asked", async () => {
      const prisma = buildPrismaStub({
        trip: {
          findUnique: jest.fn().mockResolvedValue(TRIP),
          findMany: jest.fn().mockResolvedValue([{ id: 'trip-1' }, { id: 'trip-2' }]),
        },
      });
      const service = makeService(prisma);
      const result = await service.add('trip-1', {
        userId: 'u1',
        role: CertificationType.DRIVER,
        applyToVehicleDay: true,
      });
      expect(prisma.tripCrewMember.create).toHaveBeenCalledTimes(2);
      // Still the row for the journey actually addressed, not whichever the
      // batch happened to create last.
      expect(result.tripId).toBe('trip-1');
    });

    it('skips a journey the person already crews rather than failing the whole batch', async () => {
      const prisma = buildPrismaStub({
        trip: {
          findUnique: jest.fn().mockResolvedValue(TRIP),
          findMany: jest.fn().mockResolvedValue([{ id: 'trip-1' }, { id: 'trip-2' }]),
        },
      });
      // Already on the afternoon round, not on the morning one being added to.
      prisma.tripCrewMember.findMany.mockResolvedValue([{ tripId: 'trip-2' }]);
      const service = makeService(prisma);
      await service.add('trip-1', { userId: 'u1', role: CertificationType.DRIVER, applyToVehicleDay: true });
      expect(prisma.tripCrewMember.create).toHaveBeenCalledTimes(1);
      expect(prisma.tripCrewMember.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tripId: 'trip-1' }) }),
      );
    });
  });

  describe('listCandidates', () => {
    function candidateStub() {
      return buildPrismaStub({
        user: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'u1',
              firstName: 'Ana',
              lastName: 'Dias',
              // A TAS grants TAT and SBV — the ladder must be reflected here,
              // or a fully-qualified person reads as unqualified in the dialog.
              certifications: [{ type: CertificationType.TAS, validUntil: new Date('2027-01-01T00:00:00.000Z') }],
            },
            {
              id: 'u2',
              firstName: 'Bruno',
              lastName: 'Eiras',
              certifications: [{ type: CertificationType.SBV, validUntil: new Date('2020-01-01T00:00:00.000Z') }],
            },
          ]),
        },
      });
    }

    it('resolves implied certifications and drops ones expired on the date', async () => {
      const prisma = candidateStub();
      const service = makeService(prisma);
      const [ana, bruno] = await service.listCandidates('2026-09-15');
      expect(ana.certifications).toEqual(
        expect.arrayContaining([CertificationType.TAS, CertificationType.TAT, CertificationType.SBV]),
      );
      expect(bruno.certifications).toEqual([]);
    });

    it('flags rather than hides someone absent or already crewing that day', async () => {
      const prisma = candidateStub();
      prisma.tripCrewMember.findMany.mockResolvedValue([{ userId: 'u1', tripId: 'trip-9' }]);
      const service = makeService(prisma, jest.fn().mockResolvedValue([{ userId: 'u2' }]));
      const candidates = await service.listCandidates('2026-09-15');
      expect(candidates).toHaveLength(2);
      expect(candidates.find((c) => c.userId === 'u1')).toMatchObject({ crewingTripIds: ['trip-9'] });
      expect(candidates.find((c) => c.userId === 'u2')).toMatchObject({ absent: true });
    });

    it('sorts the rostered first', async () => {
      const prisma = candidateStub();
      prisma.scheduleAssignment.findMany.mockResolvedValue([{ userId: 'u2' }]);
      const service = makeService(prisma);
      const candidates = await service.listCandidates('2026-09-15');
      expect(candidates.map((c) => c.userId)).toEqual(['u2', 'u1']);
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
