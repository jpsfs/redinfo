import { describe, expect, it } from 'vitest';
import {
  LegDirection,
  PatientMobility,
  STANDARD_TRIP_CREW_REQUIREMENT,
  TransportPlanningLane,
  TransportPlanningLeg,
  TripStatus,
  TripStopKind,
  VehicleType,
  distanceInKm,
} from '@redinfo/shared';
import { encodePolyline } from '../../../test/polyline';
import { summarizeJourneys } from './journeySummary';

// Campo, Barcelos → Porto city centre — real, well-separated points so the
// distance assertion below is meaningfully non-zero.
const BARCELOS = { latitude: 41.5388, longitude: -8.6151 };
const PORTO = { latitude: 41.1579, longitude: -8.6291 };

function leg(overrides: Partial<TransportPlanningLeg> = {}): TransportPlanningLeg {
  return {
    id: 'leg-1',
    transportRequestId: 'req-1',
    treatmentPlanId: null,
    date: '2026-09-15',
    generatedForDate: '2026-09-15',
    direction: LegDirection.OUTBOUND,
    originAddress: null,
    originLatitude: null,
    originLongitude: null,
    originFacilityId: null,
    originFacility: null,
    destinationAddress: null,
    destinationLatitude: null,
    destinationLongitude: null,
    destinationFacilityId: null,
    destinationFacility: null,
    plannedPickupAt: '2026-09-15T08:00:00.000Z',
    plannedDropoffAt: '2026-09-15T08:45:00.000Z',
    actualPickupAt: null,
    actualDropoffAt: null,
    status: 'ASSIGNED' as never,
    cancellationReason: null,
    cancellationSource: null,
    estimatedEndAt: null,
    estimatedEndSource: null,
    appointmentAt: '2026-09-15T09:00:00.000Z',
    effectiveEstimatedEndAt: '2026-09-15T10:30:00.000Z',
    arrivalWindowWarning: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    patientId: 'pat-1',
    patientMobility: PatientMobility.AMBULATORY,
    travelMinutes: 45,
    travelEstimated: false,
    travelDistanceMeters: 30_000,
    suggested: { pickupAt: null, dropoffAt: null },
    door: { origin: null, destination: null },
    ...overrides,
  };
}

function lane(overrides: Partial<TransportPlanningLane> = {}): TransportPlanningLane {
  return {
    trip: { id: 'trip-1', date: '2026-09-15', vehicleId: 'veh-1', status: TripStatus.PLANNED, notes: null, createdAt: '', updatedAt: '' },
    journeyNumber: 1,
    vehicle: {
      id: 'veh-1',
      licensePlate: 'AA-11-BB',
      numeroCauda: '101',
      vehicleType: VehicleType.TRANSPORT,
      seatedCapacity: 3,
      wheelchairPositions: 1,
      stretcherPositions: 0,
    },
    crewMembers: [],
    crewRequirement: STANDARD_TRIP_CREW_REQUIREMENT,
    stops: [],
    occupancyWindow: null,
    emptyLegs: [],
    issues: [],
    routeGeometry: null,
    ...overrides,
  };
}

function pickupAndDropoff(legId: string) {
  return [
    { id: `p-${legId}`, tripId: 'trip-1', sequence: 1, kind: TripStopKind.PICKUP, transportLegId: legId, facilityId: null, address: null, latitude: null, longitude: null, plannedAt: '2026-09-15T08:00:00.000Z', actualAt: null, dwellDecision: null, dwellMinutes: null, createdAt: '', updatedAt: '' },
    { id: `d-${legId}`, tripId: 'trip-1', sequence: 2, kind: TripStopKind.DROPOFF, transportLegId: legId, facilityId: null, address: null, latitude: null, longitude: null, plannedAt: '2026-09-15T08:45:00.000Z', actualAt: null, dwellDecision: null, dwellMinutes: null, createdAt: '', updatedAt: '' },
  ] as never;
}

describe('summarizeJourneys', () => {
  it('sums each lane\'s own driven route, not each leg\'s stand-alone distance', () => {
    const legsById = {
      'leg-1': leg({ id: 'leg-1', patientId: 'pat-1' }),
      'leg-2': leg({ id: 'leg-2', patientId: 'pat-2' }),
    };
    const routeGeometry = encodePolyline([BARCELOS, PORTO]);
    const result = summarizeJourneys(
      [
        lane({
          stops: [...pickupAndDropoff('leg-1'), ...pickupAndDropoff('leg-2')],
          routeGeometry,
        }),
      ],
      legsById,
    );

    // The lane's one driven path, not 2×`travelDistanceMeters` for the two
    // co-routed legs it carries — see `journeySummary`'s own doc comment.
    expect(result.distanceKm).toBeCloseTo(distanceInKm(BARCELOS, PORTO), 3);
    expect(result.patientCount).toBe(2);
  });

  it('sums distance across lanes, one driven path each', () => {
    const laneA = lane({ routeGeometry: encodePolyline([BARCELOS, PORTO]) });
    const laneB = lane({ trip: { ...lane().trip, id: 'trip-2' }, routeGeometry: encodePolyline([PORTO, BARCELOS]) });

    const result = summarizeJourneys([laneA, laneB], {});
    expect(result.distanceKm).toBeCloseTo(2 * distanceInKm(BARCELOS, PORTO), 3);
  });

  it('sums occupied minutes across lanes rather than spanning the day', () => {
    const laneA = lane({ occupancyWindow: { startsAt: '2026-09-15T08:00:00.000Z', endsAt: '2026-09-15T09:00:00.000Z' } });
    const laneB = lane({
      trip: { ...lane().trip, id: 'trip-2' },
      occupancyWindow: { startsAt: '2026-09-15T14:00:00.000Z', endsAt: '2026-09-15T14:30:00.000Z' },
    });

    const result = summarizeJourneys([laneA, laneB], {});

    // 60 + 30, not the 6.5h span from 08:00 to 14:30.
    expect(result.occupiedMinutes).toBe(90);
  });

  it('is round trip only once both an outbound and a return leg are present', () => {
    const legsById = {
      'leg-out': leg({ id: 'leg-out', direction: LegDirection.OUTBOUND }),
      'leg-back': leg({ id: 'leg-back', direction: LegDirection.RETURN, patientId: 'pat-1' }),
    };
    const oneWay = summarizeJourneys([lane({ stops: pickupAndDropoff('leg-out') })], legsById);
    const roundTrip = summarizeJourneys(
      [lane({ stops: [...pickupAndDropoff('leg-out'), ...pickupAndDropoff('leg-back')] })],
      legsById,
    );

    expect(oneWay.roundTrip).toBe(false);
    expect(roundTrip.roundTrip).toBe(true);
  });

  it('is crew-incomplete once any lane carries a crew or vehicle-suitability ERROR', () => {
    const incomplete = summarizeJourneys(
      [lane({ issues: [{ level: 'ERROR', code: 'CREW_TOO_FEW', message: 'short' }] })],
      {},
    );
    const complete = summarizeJourneys([lane({ issues: [{ level: 'WARNING', code: 'ARRIVAL_TOO_EARLY', message: 'early' }] })], {});

    expect(incomplete.crewComplete).toBe(false);
    expect(complete.crewComplete).toBe(true);
  });

  it('returns null distance and occupancy rather than zero when nothing is known', () => {
    const result = summarizeJourneys([lane()], {});
    expect(result.distanceKm).toBeNull();
    expect(result.occupiedMinutes).toBeNull();
  });
});
