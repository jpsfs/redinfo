import { TransportPlanningLane, TransportPlanningLeg, TripStopKind, decodePolyline } from '@redinfo/shared';
import { journeyColorForOrdinal } from '../journeyColor';
import { FeatureCollection, LineStringFeature } from './geoJson';

export interface RouteProperties {
  tripId: string;
  journeyNumber: number;
  color: string;
}

export interface RouteLine extends RouteProperties {
  points: Array<{ latitude: number; longitude: number }>;
}

/**
 * One line per lane with a drawn route (#247 stage 4) — a lane with no
 * `routeGeometry` (too few resolvable stops, or a routing outage, see
 * `TripsService.attachRouteGeometry`) simply contributes nothing, same
 * fail-soft posture as the rest of the board.
 */
export function buildRouteLines(lanes: TransportPlanningLane[]): RouteLine[] {
  return lanes
    .filter((lane): lane is TransportPlanningLane & { routeGeometry: string } => Boolean(lane.routeGeometry))
    .map((lane) => ({
      tripId: lane.trip.id,
      journeyNumber: lane.journeyNumber,
      color: journeyColorForOrdinal(lane.journeyNumber),
      points: decodePolyline(lane.routeGeometry),
    }));
}

export function routeLinesToFeatureCollection(
  routes: RouteLine[],
): FeatureCollection<LineStringFeature<RouteProperties>> {
  return {
    type: 'FeatureCollection',
    features: routes.map((route) => ({
      type: 'Feature',
      properties: { tripId: route.tripId, journeyNumber: route.journeyNumber, color: route.color },
      geometry: { type: 'LineString', coordinates: route.points.map((p) => [p.longitude, p.latitude]) },
    })),
  };
}

export interface UnplannedPinProperties {
  legId: string;
  label: string;
}

export interface UnplannedPin extends UnplannedPinProperties {
  point: { latitude: number; longitude: number };
}

/**
 * One hollow pin per unplanned leg with a known door (#247 stage 4, design
 * doc §5's "unplanned patient pins, hollow, dashed") — `door.origin` is
 * where the vehicle would have to go to collect them, which for a `RETURN`
 * leg is the facility, not the home (see `TripLegTravelService`'s own doc
 * comment on outbound-vs-return origin). A leg whose door never resolved
 * (no geocode anywhere) contributes no pin rather than a guessed one.
 *
 * `leg?.door?.origin` — the second `?.` is not redundant: every leg the
 * live board serves carries `door`, but this also runs against a caller's
 * own test fixtures written before #247 stage 4 added the field, which
 * omit it entirely rather than setting it null.
 */
export function buildUnplannedPins(
  unassignedLegIds: string[],
  legsById: Record<string, TransportPlanningLeg>,
): UnplannedPin[] {
  const pins: UnplannedPin[] = [];
  for (const legId of unassignedLegIds) {
    const leg = legsById[legId];
    const point = leg?.door?.origin;
    if (!leg || !point) continue;
    pins.push({ legId, point, label: leg.patientName ?? leg.patientId });
  }
  return pins;
}

export interface StopMarker {
  stopId: string;
  tripId: string;
  journeyNumber: number;
  color: string;
  sequence: number;
  point: { latitude: number; longitude: number };
}

/**
 * One numbered marker per stop that has a resolved point — a `PICKUP`/
 * `DROPOFF` takes its point from the leg's own `door` (see
 * `TripsService.attachRouteGeometry`'s doc comment for why a stop's own
 * `latitude`/`longitude` columns are rarely the right source), `WAIT`/
 * `RETURN_TO_BASE` from the stop's own columns, already resolved at
 * creation. Doubles as this stage's facility marker — a `DROPOFF` at a
 * clinic already sits on its door, so a separate facility layer would only
 * duplicate the same point with a different icon; see the design doc's
 * open question 1 note in `MapPanel`'s own doc comment for the trim this is.
 */
export function buildStopMarkers(
  lanes: TransportPlanningLane[],
  legsById: Record<string, TransportPlanningLeg>,
): StopMarker[] {
  const markers: StopMarker[] = [];
  for (const lane of lanes) {
    const color = journeyColorForOrdinal(lane.journeyNumber);
    for (const stop of lane.stops) {
      let point: { latitude: number; longitude: number } | null = null;
      if (stop.kind === TripStopKind.PICKUP || stop.kind === TripStopKind.DROPOFF) {
        const leg = stop.transportLegId ? legsById[stop.transportLegId] : undefined;
        point = stop.kind === TripStopKind.PICKUP ? (leg?.door?.origin ?? null) : (leg?.door?.destination ?? null);
      } else if (stop.latitude != null && stop.longitude != null) {
        point = { latitude: stop.latitude, longitude: stop.longitude };
      }
      if (!point) continue;
      markers.push({
        stopId: stop.id,
        tripId: lane.trip.id,
        journeyNumber: lane.journeyNumber,
        color,
        sequence: stop.sequence,
        point,
      });
    }
  }
  return markers;
}
