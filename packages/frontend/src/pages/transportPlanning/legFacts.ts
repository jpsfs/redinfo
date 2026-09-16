import { LegDirection, TransportPlanningLeg } from '@redinfo/shared';
import { diffMinutes } from './planningTime';

/**
 * The facility a leg is about, whichever end it sits on: an outbound leg is
 * going *to* it, a return leg is coming *from* it. Either way it is the place
 * the planner groups legs by — two patients bound for the same facility are
 * the candidates for sharing a journey, which is the single judgement the
 * board exists to support.
 */
export function legFacilityName(leg: TransportPlanningLeg): string | null {
  const facility = leg.direction === LegDirection.OUTBOUND ? leg.destinationFacility : leg.originFacility;
  return facility?.name ?? null;
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
