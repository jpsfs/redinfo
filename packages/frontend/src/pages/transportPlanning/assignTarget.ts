import { TransportPlanningLeg } from '@redinfo/shared';
import { AssignLegDialogTarget } from './AssignLegDialog';

export const DEFAULT_LEG_DURATION_MINUTES = 30;

/**
 * The dialog target for a fresh assignment out of the unassigned rail — best
 * information first: what the leg already has planned, then the board's own
 * suggestion, and only then a flat guess.
 *
 * Shared by every surface that can place one person (the board's flat "por
 * pessoa" card, a group card's per-person row, and the build page), so none of
 * them can disagree about a leg's default pickup and dropoff.
 */
export function assignTargetForLeg(legId: string, leg: TransportPlanningLeg): AssignLegDialogTarget {
  return {
    legId,
    tripId: '',
    pickupPlannedAt: leg.plannedPickupAt ?? leg.suggested.pickupAt ?? new Date().toISOString(),
    dropoffPlannedAt:
      leg.plannedDropoffAt ??
      leg.suggested.dropoffAt ??
      new Date(Date.now() + DEFAULT_LEG_DURATION_MINUTES * 60_000).toISOString(),
  };
}
