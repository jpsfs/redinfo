import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DEFAULT_ARRIVAL_WINDOW_THRESHOLDS, LegDirection, LegStatus, TransportLeg, VehicleOccupancySource } from '@redinfo/shared';
import { centroid, compareCandidates, TripPlacementSuggestionsService } from './trip-placement-suggestions.service';

// ── Ranked placement candidates (#247's Suggestions stage) ──────────────────
//
// `suggest` never writes anything — see the service's own doc comment for
// why a blocked candidate is still returned rather than filtered.

describe('centroid', () => {
  it('averages the known points and ignores the unresolvable ones', () => {
    expect(centroid([{ latitude: 40, longitude: -8 }, null, { latitude: 42, longitude: -8 }])).toEqual({
      latitude: 41,
      longitude: -8,
    });
  });

  it('is null when nothing could be resolved at all', () => {
    expect(centroid([null, undefined])).toBeNull();
  });
});

describe('compareCandidates', () => {
  const placement = (overrides: Record<string, unknown> = {}) => ({
    vehicle: { id: 'v1', numeroCauda: '01', licensePlate: 'AA-00-AA' },
    tripId: null,
    journeyNumber: null,
    insertPosition: 0,
    deltaKm: 10,
    deltaMinutes: 15,
    arrivalMarginMinutes: null,
    blockedBy: [],
    ...overrides,
  });

  it('ranks a feasible candidate ahead of a blocked one regardless of cost', () => {
    const cheapButBlocked = placement({ deltaKm: 1, blockedBy: ['CAPACITY_SEATS'] as const });
    const costlierButClean = placement({ deltaKm: 50 });
    expect([cheapButBlocked, costlierButClean].sort(compareCandidates)).toEqual([costlierButClean, cheapButBlocked]);
  });

  it('ranks the cheaper of two equally feasible candidates first', () => {
    const cheap = placement({ deltaKm: 5 });
    const costly = placement({ deltaKm: 20 });
    expect([costly, cheap].sort(compareCandidates)).toEqual([cheap, costly]);
  });
});

const THRESHOLDS = DEFAULT_ARRIVAL_WINDOW_THRESHOLDS;

const leg = (overrides: Partial<TransportLeg> = {}): TransportLeg =>
  ({
    id: 'leg-1',
    transportRequestId: 'req-1',
    treatmentPlanId: null,
    date: '2026-09-16',
    generatedForDate: '2026-09-16',
    direction: LegDirection.OUTBOUND,
    originAddress: 'Rua A, 1',
    originLatitude: null,
    originLongitude: null,
    originFacilityId: null,
    destinationAddress: null,
    destinationLatitude: null,
    destinationLongitude: null,
    destinationFacilityId: 'fac-1',
    plannedPickupAt: null,
    plannedDropoffAt: null,
    actualPickupAt: null,
    actualDropoffAt: null,
    status: LegStatus.PLANNED,
    cancellationReason: null,
    cancellationSource: null,
    estimatedEndAt: null,
    estimatedEndSource: null,
    appointmentAt: '2026-09-16T09:00:00.000Z',
    effectiveEstimatedEndAt: '2026-09-16T10:30:00.000Z',
    arrivalWindowWarning: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  }) as TransportLeg;

const PICKUP_POINT = { latitude: 41.5, longitude: -8.6 };
const DROPOFF_POINT = { latitude: 41.2, longitude: -8.6 };

interface LegEstimate {
  travelMinutes: number;
  travelEstimated: boolean;
  travelDistanceMeters: number;
  suggested: { pickupAt: string; dropoffAt: string };
  door: { origin: { latitude: number; longitude: number } | null; destination: { latitude: number; longitude: number } | null };
}

const ESTIMATE_L1: LegEstimate = {
  travelMinutes: 30,
  travelEstimated: false,
  travelDistanceMeters: 20_000,
  suggested: { pickupAt: '2026-09-16T08:00:00.000Z', dropoffAt: '2026-09-16T08:30:00.000Z' },
  door: { origin: PICKUP_POINT, destination: DROPOFF_POINT },
};

const VEHICLE = { id: 'v1', licensePlate: 'AA-00-AA', numeroCauda: '01', seatedCapacity: 3, wheelchairPositions: 1, stretcherPositions: 0 };

/** A demand row shaped like `loadPassengerRequirements`' own `prisma.transportLeg.findMany`
 * query — mobility drives the capacity check, everything else is fixed. */
function demandRow(legId: string, mobility: 'AMBULATORY' | 'WHEELCHAIR' | 'STRETCHER') {
  return { id: legId, transportRequest: { escortTravels: false, patient: { mobility } } };
}

function buildService(
  options: {
    findByIds?: TransportLeg[];
    tripStopCount?: number;
    vehicles?: (typeof VEHICLE)[];
    trips?: unknown[];
    occupancies?: { vehicleId: string; startsAt: Date; endsAt: Date; source: string; sourceId: string }[];
    demandRows?: ReturnType<typeof demandRow>[];
    estimates?: Map<string, LegEstimate>;
    distanceMatrixResult?: ({ durationSeconds: number; distanceMeters: number; estimated: boolean } | undefined)[][];
  } = {},
) {
  const prisma = {
    tripStop: { count: jest.fn().mockResolvedValue(options.tripStopCount ?? 0) },
    vehicle: { findMany: jest.fn().mockResolvedValue(options.vehicles ?? [VEHICLE]) },
    trip: { findMany: jest.fn().mockResolvedValue(options.trips ?? []) },
    transportRequest: { findMany: jest.fn().mockResolvedValue([{ id: 'req-1', patientId: 'pat-1' }]) },
    transportLeg: { findMany: jest.fn().mockResolvedValue(options.demandRows ?? [demandRow('leg-1', 'AMBULATORY')]) },
  };
  const transportRequestLegs = { findByIds: jest.fn().mockResolvedValue(options.findByIds ?? [leg()]) };
  const patients = { findManyForDisplay: jest.fn().mockResolvedValue(new Map()) };
  const delegationSettings = { get: jest.fn().mockResolvedValue(THRESHOLDS) };
  const estimates = options.estimates ?? new Map([['leg-1', ESTIMATE_L1]]);
  const legTravel = {
    estimateMany: jest.fn((legs: TransportLeg[]) => Promise.resolve(new Map(legs.map((l) => [l.id, estimates.get(l.id)])))),
  };
  const vehicleOccupancy = { findInRange: jest.fn().mockResolvedValue(options.occupancies ?? []) };
  const routing = {
    distanceMatrix: jest.fn().mockResolvedValue(options.distanceMatrixResult ?? [[undefined, { durationSeconds: 900, distanceMeters: 20_000, estimated: false }], [undefined, undefined]]),
  };
  const service = new TripPlacementSuggestionsService(
    prisma as never,
    transportRequestLegs as never,
    patients as never,
    delegationSettings as never,
    legTravel as never,
    vehicleOccupancy as never,
    routing as never,
  );
  return { service, prisma, transportRequestLegs, vehicleOccupancy, routing };
}

describe('TripPlacementSuggestionsService.suggest', () => {
  it('rejects when a requested leg does not exist', async () => {
    const { service } = buildService({ findByIds: [] });
    await expect(service.suggest(['leg-1'], { id: 'u1', roles: [] })).rejects.toThrow(NotFoundException);
  });

  it('rejects a leg that is already cancelled', async () => {
    const { service } = buildService({ findByIds: [leg({ status: LegStatus.CANCELLED })] });
    await expect(service.suggest(['leg-1'], { id: 'u1', roles: [] })).rejects.toThrow(ConflictException);
  });

  it('rejects a group spanning more than one date', async () => {
    const { service } = buildService({
      findByIds: [leg({ id: 'leg-1', date: '2026-09-16' }), leg({ id: 'leg-2', date: '2026-09-17' })],
    });
    await expect(service.suggest(['leg-1', 'leg-2'], { id: 'u1', roles: [] })).rejects.toThrow(BadRequestException);
  });

  it('rejects a leg that already has a stop on some trip', async () => {
    const { service } = buildService({ tripStopCount: 1 });
    await expect(service.suggest(['leg-1'], { id: 'u1', roles: [] })).rejects.toThrow(ConflictException);
  });

  it('ranks a fresh journey on an idle vehicle, costed by the routed detour', async () => {
    const { service } = buildService();
    const [placement] = await service.suggest(['leg-1'], { id: 'u1', roles: [] });
    expect(placement.vehicle.id).toBe('v1');
    expect(placement.tripId).toBeNull();
    expect(placement.journeyNumber).toBeNull();
    expect(placement.insertPosition).toBe(0);
    expect(placement.deltaKm).toBe(20);
    expect(placement.deltaMinutes).toBe(15);
    // Appointment 09:00, suggested pickup 08:00 + 15 minutes' travel lands
    // the dropoff at 08:15 — 45 minutes of slack.
    expect(placement.arrivalMarginMinutes).toBe(45);
    expect(placement.blockedBy).toEqual([]);
  });

  it('flags a vehicle that cannot seat this group at all', async () => {
    const { service } = buildService({
      vehicles: [{ ...VEHICLE, wheelchairPositions: 0 }],
      demandRows: [demandRow('leg-1', 'WHEELCHAIR')],
    });
    const [placement] = await service.suggest(['leg-1'], { id: 'u1', roles: [] });
    expect(placement.blockedBy).toContain('CAPACITY_WHEELCHAIR');
  });

  it('flags a vehicle already committed elsewhere for the group window', async () => {
    const { service } = buildService({
      occupancies: [
        {
          vehicleId: 'v1',
          startsAt: new Date('2026-09-16T07:30:00.000Z'),
          endsAt: new Date('2026-09-16T08:15:00.000Z'),
          source: VehicleOccupancySource.MAINTENANCE,
          sourceId: 'maint-1',
        },
      ],
    });
    const [placement] = await service.suggest(['leg-1'], { id: 'u1', roles: [] });
    expect(placement.blockedBy).toContain('VEHICLE_UNAVAILABLE');
  });

  it('never blocks on the vehicle bookings this exact insertion would leave alone', async () => {
    // A conflict entirely outside the group's own window is not this
    // candidate's problem.
    const { service } = buildService({
      occupancies: [
        {
          vehicleId: 'v1',
          startsAt: new Date('2026-09-16T14:00:00.000Z'),
          endsAt: new Date('2026-09-16T15:00:00.000Z'),
          source: VehicleOccupancySource.MAINTENANCE,
          sourceId: 'maint-1',
        },
      ],
    });
    const [placement] = await service.suggest(['leg-1'], { id: 'u1', roles: [] });
    expect(placement.blockedBy).not.toContain('VEHICLE_UNAVAILABLE');
  });

  it('ranks an existing journey by whichever end of its route is cheaper to detour through', async () => {
    const baseStop = {
      id: 'stop-base',
      tripId: 'trip-1',
      sequence: 1,
      kind: 'DEPART_FROM_BASE',
      transportLegId: null,
      facilityId: null,
      address: 'Base',
      latitude: 40.0,
      longitude: -8.0,
      plannedAt: new Date('2026-09-16T07:00:00.000Z'),
      actualAt: null,
      dwellDecision: null,
      dwellMinutes: null,
      createdAt: new Date('2026-09-15T00:00:00.000Z'),
      updatedAt: new Date('2026-09-15T00:00:00.000Z'),
    };
    const { service } = buildService({
      trips: [{ id: 'trip-1', vehicleId: 'v1', stops: [baseStop] }],
      // matrix indices: 0 = pickup, 1 = dropoff, 2 = the trip's one stop (base).
      distanceMatrixResult: [
        [undefined, { durationSeconds: 900, distanceMeters: 20_000, estimated: false }, undefined],
        [undefined, undefined, { durationSeconds: 600, distanceMeters: 10_000, estimated: false }],
        [{ durationSeconds: 300, distanceMeters: 5_000, estimated: false }, undefined, undefined],
      ],
    });

    const placements = await service.suggest(['leg-1'], { id: 'u1', roles: [] });
    const existing = placements.find((p) => p.tripId === 'trip-1');
    expect(existing).toBeDefined();
    expect(existing!.journeyNumber).toBe(1);
    // Appending after the base stop (5km + the 20km pickup→dropoff leg) beats
    // prepending before it (10km + the same 20km leg).
    expect(existing!.insertPosition).toBe(1);
    expect(existing!.deltaKm).toBe(25);
    expect(existing!.deltaMinutes).toBe(20);
    expect(existing!.arrivalMarginMinutes).toBe(100);
    expect(existing!.blockedBy).toEqual([]);

    // The same vehicle's fresh-trip option is still offered alongside it.
    expect(placements.some((p) => p.tripId === null)).toBe(true);
  });

  it('flags a candidate whose door could not be resolved at all, instead of fabricating a cost', async () => {
    const { service } = buildService({
      estimates: new Map([['leg-1', { ...ESTIMATE_L1, door: { origin: null, destination: null } }]]),
    });
    const [placement] = await service.suggest(['leg-1'], { id: 'u1', roles: [] });
    expect(placement.blockedBy).toContain('ROUTE_UNKNOWN');
  });
});
