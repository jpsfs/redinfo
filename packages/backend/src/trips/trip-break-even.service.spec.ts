import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { LegDirection, TransportRequestOccurrenceType, TripStopKind } from '@redinfo/shared';
import { TripBreakEvenService } from './trip-break-even.service';

// ── Break-even helper (#234) ────────────────────────────────────────────────
//
// "Wait when the round trip back to base exceeds the expected dwell" —
// exposed as data off a DROPOFF stop of an OUTBOUND leg directly, using the
// leg's own `effectiveEstimatedEndAt` (#233). Decides nothing.

const STOP = {
  id: 'stop-1',
  tripId: 'trip-1',
  kind: TripStopKind.DROPOFF,
  transportLegId: 'leg-1',
  plannedAt: new Date('2026-09-15T09:00:00.000Z'),
};

const LEG = {
  id: 'leg-1',
  direction: LegDirection.OUTBOUND,
  estimatedEndAt: null,
  destinationLatitude: 41.1,
  destinationLongitude: -8.1,
  destinationFacility: { latitude: 41.1, longitude: -8.1 },
  transportRequest: { occurrenceType: TransportRequestOccurrenceType.CONSULTA, appointmentAt: new Date('2026-09-15T09:00:00.000Z') },
};

function buildPrismaStub(overrides: Record<string, unknown> = {}) {
  return {
    tripStop: { findUnique: jest.fn().mockResolvedValue(STOP) },
    transportLeg: { findUnique: jest.fn().mockResolvedValue(LEG) },
    ...overrides,
  };
}

function makeService(prisma: ReturnType<typeof buildPrismaStub>, routingOverrides: Record<string, unknown> = {}) {
  const delegationSettings = { get: jest.fn().mockResolvedValue({ baseLatitude: 41.6, baseLongitude: -8.6 }) };
  const occurrenceTypePolicies = {
    getEffectiveMap: jest.fn().mockResolvedValue({
      [TransportRequestOccurrenceType.CONSULTA]: { minimumDurationMinutes: 30, defaultDurationMinutes: 45 },
    }),
  };
  const routing = {
    distanceMatrix: jest.fn().mockResolvedValue([[{ durationSeconds: 1800, distanceMeters: 30000, estimated: false }]]),
    geocode: jest.fn(),
    ...routingOverrides,
  };
  return new TripBreakEvenService(prisma as never, delegationSettings as never, occurrenceTypePolicies as never, routing as never);
}

describe('TripBreakEvenService', () => {
  it('404s for a stop not on this trip', async () => {
    const prisma = buildPrismaStub({ tripStop: { findUnique: jest.fn().mockResolvedValue(null) } });
    const service = makeService(prisma);
    await expect(service.getBreakEven('trip-1', 'stop-1')).rejects.toThrow(NotFoundException);
  });

  it('refuses a stop that is not a DROPOFF', async () => {
    const prisma = buildPrismaStub({ tripStop: { findUnique: jest.fn().mockResolvedValue({ ...STOP, kind: TripStopKind.PICKUP }) } });
    const service = makeService(prisma);
    await expect(service.getBreakEven('trip-1', 'stop-1')).rejects.toThrow(BadRequestException);
  });

  it('refuses a RETURN leg — there is no dwell to break even against', async () => {
    const prisma = buildPrismaStub({ transportLeg: { findUnique: jest.fn().mockResolvedValue({ ...LEG, direction: LegDirection.RETURN }) } });
    const service = makeService(prisma);
    await expect(service.getBreakEven('trip-1', 'stop-1')).rejects.toThrow(BadRequestException);
  });

  it('refuses a destination with no coordinates', async () => {
    const prisma = buildPrismaStub({
      transportLeg: {
        findUnique: jest.fn().mockResolvedValue({ ...LEG, destinationLatitude: null, destinationLongitude: null, destinationFacility: null }),
      },
    });
    const service = makeService(prisma);
    await expect(service.getBreakEven('trip-1', 'stop-1')).rejects.toThrow(ConflictException);
  });

  it('computes expected dwell (from the floor, since no estimate was supplied) and the round trip to base', async () => {
    const prisma = buildPrismaStub();
    const service = makeService(prisma);
    const result = await service.getBreakEven('trip-1', 'stop-1');
    // appointmentAt 09:00 + 30-minute floor = 09:30; dropoff planned at 09:00 → 30 minutes dwell.
    expect(result.expectedDwellMinutes).toBe(30);
    expect(result.travelToBaseMinutes).toBe(30);
    expect(result.roundTripToBaseMinutes).toBe(60);
  });

  it('prefers the leg\'s own supplied estimatedEndAt over the occurrence-type floor', async () => {
    const prisma = buildPrismaStub({
      transportLeg: { findUnique: jest.fn().mockResolvedValue({ ...LEG, estimatedEndAt: new Date('2026-09-15T10:00:00.000Z') }) },
    });
    const service = makeService(prisma);
    const result = await service.getBreakEven('trip-1', 'stop-1');
    expect(result.expectedDwellMinutes).toBe(60);
  });
});
