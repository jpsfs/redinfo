import { LegDirection, TransportPlanningLeg, TripStop, TripStopKind } from '@redinfo/shared';
import { diffMinutes } from './planningTime';

/**
 * The facility a leg is about, whichever end it sits on: an outbound leg is
 * going *to* it, a return leg is coming *from* it. Either way it is the place
 * the planner groups legs by — two patients bound for the same facility are
 * the candidates for sharing a journey, which is the single judgement the
 * board exists to support.
 */
function legFacility(leg: TransportPlanningLeg): { id: string; name: string } | null {
  const facility = leg.direction === LegDirection.OUTBOUND ? leg.destinationFacility : leg.originFacility;
  return facility ?? null;
}

export function legFacilityName(leg: TransportPlanningLeg): string | null {
  return legFacility(leg)?.name ?? null;
}

/** As `legFacilityName`, but the id — what the unplanned rail groups by
 * (#247 stage 2), since two facilities can share a name across localities. */
export function legFacilityId(leg: TransportPlanningLeg): string | null {
  return legFacility(leg)?.id ?? null;
}

/**
 * Where *this particular stop* actually is — the patient's own home/care
 * address for a `PICKUP` on an outbound leg or a `DROPOFF` on a return one,
 * the facility for the other end. Deliberately keyed by the stop's own
 * `kind` rather than `leg.direction` the way `legFacilityName` is: that
 * function answers "which facility is this leg about" (right for grouping
 * legs sharing a destination), but a stop table showing every stop of a
 * mixed-direction journey needs each row's own end, not the leg's single
 * "about" facility repeated on both its pickup and its dropoff row.
 */
export function stopLocationLabel(stop: TripStop, leg: TransportPlanningLeg | undefined): string | null {
  if (!leg) return null;
  if (stop.kind === TripStopKind.PICKUP) return leg.originFacility?.name ?? leg.originAddress ?? null;
  if (stop.kind === TripStopKind.DROPOFF) return leg.destinationFacility?.name ?? leg.destinationAddress ?? null;
  return null;
}

/**
 * When the vehicle needs to be *at the facility* for this leg — the instant
 * the unplanned rail groups around (#247 stage 2, ±15 minutes). An outbound
 * leg is anchored on arrival, H.I.; a return leg is anchored on when the
 * patient is ready, H.F. — both are "when a vehicle must be at this door",
 * just at opposite ends of the leg.
 */
export function legFacilityArrivalInstant(leg: TransportPlanningLeg): string {
  return leg.direction === LegDirection.OUTBOUND ? leg.appointmentAt : leg.effectiveEstimatedEndAt;
}

/**
 * The distinct facilities a journey is about, in the order its legs are
 * served. Almost always one — the whole point of sharing a journey is a shared
 * destination — so the lane header prints it outright and only falls back to
 * "+N" on the rare mixed round.
 */
export function journeyDestinations(legsInOrder: (TransportPlanningLeg | undefined)[]): string[] {
  const names: string[] = [];
  for (const leg of legsInOrder) {
    const name = leg ? legFacilityName(leg) : null;
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

/**
 * How long the patient is expected to be at the facility — H.I. to H.F. on the
 * printed sheet. This is what decides whether the crew waits or leaves, so #219
 * requires it on the board rather than buried behind a click.
 *
 * Only meaningful on the outbound leg: a return leg starts at H.F., by which
 * point the treatment is over.
 */
export function treatmentMinutes(leg: TransportPlanningLeg): number | null {
  if (leg.direction !== LegDirection.OUTBOUND) return null;
  const minutes = diffMinutes(leg.appointmentAt, leg.effectiveEstimatedEndAt);
  return minutes > 0 ? minutes : null;
}

/**
 * The times the card actually shows, with the planner's own placement winning
 * over the suggestion wherever one exists.
 *
 * A leg already on the board has committed times — those are what the patient
 * was told and what the crew will work from, so they must not be silently
 * redrawn as a fresh suggestion every time the board reloads (#219's "planned
 * times are outputs of planning… stored, not recomputed on read"). An
 * unassigned leg has none yet, and the suggestion is the whole point of it.
 */
export function effectiveLegTimes(leg: TransportPlanningLeg): {
  pickupAt: string | null;
  dropoffAt: string | null;
  isSuggested: boolean;
} {
  if (leg.plannedPickupAt || leg.plannedDropoffAt) {
    return { pickupAt: leg.plannedPickupAt, dropoffAt: leg.plannedDropoffAt, isSuggested: false };
  }
  return { pickupAt: leg.suggested.pickupAt, dropoffAt: leg.suggested.dropoffAt, isSuggested: true };
}

/** Whether a `DROPOFF` stop still needs a wait-or-release decision — an
 * outbound leg's dropoff with no `WAIT` stop already recorded at the same
 * facility right after it. Shared by `PlanningLane` (the board) and
 * `JourneyStopTable` (#247 stage 3's journey page), so the two surfaces
 * never disagree about which dropoff still needs deciding. */
export function needsWaitReleaseDecision(
  stop: TripStop,
  allStops: TripStop[],
  leg: TransportPlanningLeg | undefined,
): boolean {
  if (!leg || leg.direction !== LegDirection.OUTBOUND) return false;
  return !allStops.some(
    (s) => s.kind === TripStopKind.WAIT && s.facilityId === stop.facilityId && s.plannedAt >= stop.plannedAt,
  );
}

/**
 * "Quitéria Lopes Marques" → "Quitéria L." — the form a bar too narrow for the
 * full name shows. First name plus the initial of the *first* surname, because
 * Portuguese names commonly carry three or four, and the last one is the least
 * distinguishing in a delegation where families share it.
 */
export function shortenPatientName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return name.trim();
  return `${parts[0]} ${parts[1][0]}.`;
}
