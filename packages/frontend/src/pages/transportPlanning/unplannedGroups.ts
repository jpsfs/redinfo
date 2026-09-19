import { LegDirection, PatientMobility, TransportPlanningLane, TransportPlanningLeg } from '@redinfo/shared';
import { legFacilityArrivalInstant, legFacilityId, legFacilityName } from './legFacts';
import { minutesOfDay } from './planningTime';

/** A 15-minute grid, not a sliding ±15-minute window — see the design doc's
 * §3 worked example (a 09:00 and a 09:10 appointment at the same hospital):
 * both floor to the 09:00 bucket, which is the one case this needs to get
 * right. A straddling pair (09:07 and 09:23) landing in different buckets is
 * the trade-off for not needing a full clustering pass over the rail. */
const BUCKET_MINUTES = 15;

export interface UnplannedGroup {
  key: string;
  facilityId: string | null;
  facilityName: string | null;
  direction: LegDirection;
  /** The earliest of the group's own arrival instants — what the rail sorts
   * groups by. */
  arrivalInstant: string;
  legIds: string[];
}

/**
 * The unplanned rail's grouped view (#247 stage 2) — destination + direction
 * + arrival window, ±15 minutes. See
 * `docs/plans/planeamento-transportes-redesign.md` §3: the unit of a
 * planning decision is "this vehicle, at this facility, at this time", not
 * a lone person, so three dialysis patients finishing at noon are one group.
 */
export function groupUnplannedLegs(
  legIds: string[],
  legsById: Record<string, TransportPlanningLeg>,
): UnplannedGroup[] {
  const groups = new Map<string, UnplannedGroup>();
  for (const legId of legIds) {
    const leg = legsById[legId];
    if (!leg) continue;
    const facilityId = legFacilityId(leg);
    const instant = legFacilityArrivalInstant(leg);
    const bucket = Math.floor(minutesOfDay(instant) / BUCKET_MINUTES) * BUCKET_MINUTES;
    const key = `${facilityId ?? 'none'}|${leg.direction}|${bucket}`;

    const existing = groups.get(key);
    if (existing) {
      existing.legIds.push(legId);
      if (new Date(instant) < new Date(existing.arrivalInstant)) existing.arrivalInstant = instant;
    } else {
      groups.set(key, {
        key,
        facilityId,
        facilityName: legFacilityName(leg),
        direction: leg.direction,
        arrivalInstant: instant,
        legIds: [legId],
      });
    }
  }
  return [...groups.values()].sort(
    (a, b) => new Date(a.arrivalInstant).getTime() - new Date(b.arrivalInstant).getTime(),
  );
}

export interface PassengerDemand {
  seats: number;
  wheelchairPositions: number;
  stretcherPositions: number;
}

const NO_DEMAND: PassengerDemand = { seats: 0, wheelchairPositions: 0, stretcherPositions: 0 };

function demandFor(mobility: PatientMobility): PassengerDemand {
  if (mobility === PatientMobility.WHEELCHAIR) return { ...NO_DEMAND, wheelchairPositions: 1 };
  if (mobility === PatientMobility.STRETCHER) return { ...NO_DEMAND, stretcherPositions: 1 };
  return { ...NO_DEMAND, seats: 1 };
}

/** What the whole group would take up, boarded at once — the single number
 * that decides whether it fits a vehicle "whole", per the design doc's own
 * wording. */
export function groupDemand(group: UnplannedGroup, legsById: Record<string, TransportPlanningLeg>): PassengerDemand {
  return group.legIds.reduce((total, legId) => {
    const leg = legsById[legId];
    const demand = leg ? demandFor(leg.patientMobility) : NO_DEMAND;
    return {
      seats: total.seats + demand.seats,
      wheelchairPositions: total.wheelchairPositions + demand.wheelchairPositions,
      stretcherPositions: total.stretcherPositions + demand.stretcherPositions,
    };
  }, NO_DEMAND);
}

export interface GroupFeasibility {
  fits: boolean;
  /** Which capacity dimension no vehicle on today's board could cover at
   * all, empty or not — unset when `fits` is true, or when there is no
   * fleet on the board yet to check against (silence, not a false alarm). */
  reason?: 'SEATS' | 'WHEELCHAIR' | 'STRETCHER';
}

/**
 * A deliberately coarse check — "does any vehicle on today's board have
 * enough of each position type for this group, assuming it starts empty" —
 * not a real placement search (that's `POST /trips/suggest-placements`, see
 * `SuggestPlacementsDialog`). Honest about the gap: it can say a group fits
 * no vehicle at all, never that a specific vehicle can take it right now,
 * since that also depends on what's already aboard.
 */
export function groupFeasibility(demand: PassengerDemand, vehicles: TransportPlanningLane['vehicle'][]): GroupFeasibility {
  if (vehicles.length === 0) return { fits: true };
  const fitsSomeVehicle = vehicles.some(
    (vehicle) =>
      vehicle.seatedCapacity >= demand.seats &&
      vehicle.wheelchairPositions >= demand.wheelchairPositions &&
      vehicle.stretcherPositions >= demand.stretcherPositions,
  );
  if (fitsSomeVehicle) return { fits: true };
  if (!vehicles.some((vehicle) => vehicle.wheelchairPositions >= demand.wheelchairPositions)) {
    return { fits: false, reason: 'WHEELCHAIR' };
  }
  if (!vehicles.some((vehicle) => vehicle.stretcherPositions >= demand.stretcherPositions)) {
    return { fits: false, reason: 'STRETCHER' };
  }
  return { fits: false, reason: 'SEATS' };
}
