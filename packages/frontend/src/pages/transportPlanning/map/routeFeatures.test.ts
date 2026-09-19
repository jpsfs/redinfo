import { describe, expect, it } from 'vitest';
import { TransportPlanningLane, TransportPlanningLeg, TripStopKind, decodePolyline } from '@redinfo/shared';
import { journeyColorForOrdinal } from '../journeyColor';
import { buildRouteLines, buildStopMarkers, buildUnplannedPins, routeLinesToFeatureCollection } from './routeFeatures';

// A short, real Google-encoded polyline (precision 5) — used only to prove
// `decodePolyline` actually runs, not to assert particular coordinates.
const ENCODED = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';

function lane(overrides: Partial<TransportPlanningLane> = {}): TransportPlanningLane {
  return {
    trip: { id: 'trip-1', date: '2026-09-16', vehicleId: 'v1', status: 'PLANNED', notes: null, createdAt: '', updatedAt: '' } as never,
    journeyNumber: 1,
    vehicle: {} as never,
    crewMembers: [],
    crewRequirement: {} as never,
    stops: [],
    occupancyWindow: null,
    emptyLegs: [],
    issues: [],
    routeGeometry: null,
    ...overrides,
  };
}

function leg(overrides: Partial<TransportPlanningLeg> = {}): TransportPlanningLeg {
  return {
    id: 'leg-1',
    patientId: 'pat-1',
    patientMobility: 'AMBULATORY',
    travelMinutes: null,
    travelEstimated: false,
    travelDistanceMeters: null,
    suggested: { pickupAt: null, dropoffAt: null },
    door: { origin: null, destination: null },
    ...overrides,
  } as never;
}

describe('buildRouteLines', () => {
  it('skips a lane with no route geometry', () => {
    expect(buildRouteLines([lane({ routeGeometry: null })])).toEqual([]);
  });

  it('decodes a lane’s geometry into its own coloured line, keyed by journey ordinal', () => {
    const [route] = buildRouteLines([lane({ routeGeometry: ENCODED, journeyNumber: 3 })]);
    expect(route.tripId).toBe('trip-1');
    expect(route.color).toBe(journeyColorForOrdinal(3));
    expect(route.points).toEqual(decodePolyline(ENCODED));
    expect(route.points.length).toBeGreaterThan(0);
  });
});

describe('routeLinesToFeatureCollection', () => {
  it('turns latitude/longitude points into [lng, lat] GeoJSON coordinates', () => {
    const [route] = buildRouteLines([lane({ routeGeometry: ENCODED })]);
    const fc = routeLinesToFeatureCollection([route]);
    expect(fc.features[0].geometry.coordinates[0]).toEqual([route.points[0].longitude, route.points[0].latitude]);
  });
});

describe('buildUnplannedPins', () => {
  it('drops a leg whose door never resolved, rather than pinning nothing meaningful', () => {
    const legsById = { 'leg-1': leg({ door: { origin: null, destination: null } }) };
    expect(buildUnplannedPins(['leg-1'], legsById)).toEqual([]);
  });

  it('pins an unplanned leg at its resolved origin door, labelled by patient name', () => {
    const origin = { latitude: 41.53, longitude: -8.62 };
    const legsById = { 'leg-1': leg({ door: { origin, destination: null }, patientName: 'Ana Reis' }) };
    expect(buildUnplannedPins(['leg-1'], legsById)).toEqual([{ legId: 'leg-1', point: origin, label: 'Ana Reis' }]);
  });

  it('falls back to the patient id when a caller has no VIEW_PATIENT_IDENTITY', () => {
    const origin = { latitude: 41.53, longitude: -8.62 };
    const legsById = { 'leg-1': leg({ door: { origin, destination: null } }) };
    expect(buildUnplannedPins(['leg-1'], legsById)[0].label).toBe('pat-1');
  });

  it('never throws against a leg with no door field at all — an older fixture, not a live board leg', () => {
    const { door: _door, ...legWithoutDoor } = leg();
    const legsById = { 'leg-1': legWithoutDoor as TransportPlanningLeg };
    expect(buildUnplannedPins(['leg-1'], legsById)).toEqual([]);
  });
});

describe('buildStopMarkers', () => {
  const origin = { latitude: 41.53, longitude: -8.62 };
  const destination = { latitude: 41.18, longitude: -8.6 };

  it('takes a PICKUP/DROPOFF stop’s point from the leg’s own door, not the stop’s own columns', () => {
    const legsById = { 'leg-1': leg({ door: { origin, destination } }) };
    const lanes = [
      lane({
        stops: [
          { id: 's1', tripId: 'trip-1', sequence: 1, kind: TripStopKind.PICKUP, transportLegId: 'leg-1', facilityId: null, address: null, latitude: null, longitude: null, plannedAt: '2026-09-16T08:00:00.000Z', actualAt: null, dwellDecision: null, dwellMinutes: null, createdAt: '', updatedAt: '' },
          { id: 's2', tripId: 'trip-1', sequence: 2, kind: TripStopKind.DROPOFF, transportLegId: 'leg-1', facilityId: null, address: null, latitude: null, longitude: null, plannedAt: '2026-09-16T08:30:00.000Z', actualAt: null, dwellDecision: null, dwellMinutes: null, createdAt: '', updatedAt: '' },
        ],
      }),
    ];

    const markers = buildStopMarkers(lanes, legsById);
    expect(markers).toHaveLength(2);
    expect(markers[0]).toMatchObject({ stopId: 's1', point: origin, sequence: 1 });
    expect(markers[1]).toMatchObject({ stopId: 's2', point: destination, sequence: 2 });
  });

  it('takes a WAIT/RETURN_TO_BASE stop’s point from its own already-resolved columns', () => {
    const base = { latitude: 41.55, longitude: -8.42 };
    const lanes = [
      lane({
        stops: [
          { id: 's3', tripId: 'trip-1', sequence: 3, kind: TripStopKind.RETURN_TO_BASE, transportLegId: null, facilityId: null, address: 'Base', latitude: base.latitude, longitude: base.longitude, plannedAt: '2026-09-16T09:00:00.000Z', actualAt: null, dwellDecision: null, dwellMinutes: null, createdAt: '', updatedAt: '' },
        ],
      }),
    ];

    const markers = buildStopMarkers(lanes, {});
    expect(markers).toEqual([expect.objectContaining({ stopId: 's3', point: base })]);
  });

  it('drops a stop whose point never resolved', () => {
    const lanes = [
      lane({
        stops: [
          { id: 's4', tripId: 'trip-1', sequence: 1, kind: TripStopKind.PICKUP, transportLegId: 'leg-missing', facilityId: null, address: null, latitude: null, longitude: null, plannedAt: '2026-09-16T08:00:00.000Z', actualAt: null, dwellDecision: null, dwellMinutes: null, createdAt: '', updatedAt: '' },
        ],
      }),
    ];
    expect(buildStopMarkers(lanes, {})).toEqual([]);
  });

  it('never throws against a leg with no door field at all — an older fixture, not a live board leg', () => {
    const { door: _door, ...legWithoutDoor } = leg();
    const legsById = { 'leg-1': legWithoutDoor as TransportPlanningLeg };
    const lanes = [
      lane({
        stops: [
          { id: 's5', tripId: 'trip-1', sequence: 1, kind: TripStopKind.PICKUP, transportLegId: 'leg-1', facilityId: null, address: null, latitude: null, longitude: null, plannedAt: '2026-09-16T08:00:00.000Z', actualAt: null, dwellDecision: null, dwellMinutes: null, createdAt: '', updatedAt: '' },
        ],
      }),
    ];
    expect(buildStopMarkers(lanes, legsById)).toEqual([]);
  });
});
