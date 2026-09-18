import { LegDirection, TransportPlanningLane, TransportPlanningLeg, TripStopKind, polylineDistanceKm } from '@redinfo/shared';

/** `checkTripCrew`/`checkCrewAvailability`'s own ERROR codes (`trips.service.ts`,
 * shared's `checkTripCrew`) — the set a journey's crew must clear to earn the
 * "crew complete" badge. Kept local rather than exported from shared, since
 * nothing there needs to enumerate its own codes back to itself. */
const CREW_ISSUE_CODES = new Set(['CREW_TOO_FEW', 'VEHICLE_NOT_EMERGENCY', 'CREW_UNAVAILABLE']);

export interface JourneySummary {
  /** Sum of each lane's own driven path (`routeGeometry`, walked with
   * `polylineDistanceKm`) — null when none of the lanes could be routed.
   * Deliberately not a sum of each carried leg's own `travelDistanceMeters`:
   * that figure is the distance *that one patient's* pickup→dropoff would
   * cover driven alone, and summing it double-counts every road segment two
   * co-routed patients share while missing the empty runs between stops —
   * see `polylineDistanceKm`'s own doc comment. */
  distanceKm: number | null;
  /** Sum of each lane's own occupancy window, not the span between the
   * earliest start and the latest end — a vehicle idle between two journeys
   * was never "occupied" for that gap. */
  occupiedMinutes: number | null;
  /** Distinct patients carried, deduplicated across every lane passed in. */
  patientCount: number;
  /** True once at least one lane carries both an outbound and a return leg. */
  roundTrip: boolean;
  /** True only once every lane is clear of a crew/vehicle-suitability ERROR. */
  crewComplete: boolean;
}

/**
 * The vehicle-day page's aggregated summary row, and — passed a single-lane
 * array — the same row the standalone journey page shows for just that one
 * journey (#247 stage 5's own requirement: one block, aggregated over
 * however many lanes are in view, rather than two separately-computed
 * flavours that could drift apart).
 */
export function summarizeJourneys(
  lanes: TransportPlanningLane[],
  legsById: Record<string, TransportPlanningLeg>,
): JourneySummary {
  let distanceKm = 0;
  let hasDistance = false;
  let occupiedMinutes = 0;
  let hasOccupancy = false;
  const patientIds = new Set<string>();
  const directions = new Set<LegDirection>();
  let crewComplete = true;

  for (const lane of lanes) {
    for (const stop of lane.stops) {
      if (stop.kind !== TripStopKind.PICKUP) continue;
      const leg = stop.transportLegId ? legsById[stop.transportLegId] : undefined;
      if (!leg) continue;
      patientIds.add(leg.patientId);
      directions.add(leg.direction);
    }

    if (lane.routeGeometry) {
      distanceKm += polylineDistanceKm(lane.routeGeometry);
      hasDistance = true;
    }

    if (lane.occupancyWindow) {
      const minutes = (new Date(lane.occupancyWindow.endsAt).getTime() - new Date(lane.occupancyWindow.startsAt).getTime()) / 60_000;
      occupiedMinutes += minutes;
      hasOccupancy = true;
    }

    if (lane.issues.some((issue) => issue.level === 'ERROR' && CREW_ISSUE_CODES.has(issue.code))) {
      crewComplete = false;
    }
  }

  return {
    distanceKm: hasDistance ? distanceKm : null,
    occupiedMinutes: hasOccupancy ? occupiedMinutes : null,
    patientCount: patientIds.size,
    roundTrip: directions.has(LegDirection.OUTBOUND) && directions.has(LegDirection.RETURN),
    crewComplete,
  };
}
