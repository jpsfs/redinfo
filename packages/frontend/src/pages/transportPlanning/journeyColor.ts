import { journeyColorRamp } from '../../layout/design-tokens';

/**
 * Stable per `(vehicle, journey ordinal)`, not per journey id — a lane's
 * `journeyNumber` (#247 stage 1, server-computed, see
 * `TransportPlanningLane.journeyNumber`'s doc comment) already carries the
 * vehicle: it is 1-based *within that vehicle's own day*, so a different
 * vehicle's first journey lands on the same hue as this one's. That repeat
 * is deliberate (see `docs/plans/planeamento-transportes-redesign.md` §4)
 * — focus mode, not a bigger palette, is what disambiguates a heavy day.
 */
export function journeyColorForOrdinal(journeyNumber: number): string {
  const index = (journeyNumber - 1) % journeyColorRamp.length;
  return journeyColorRamp[index < 0 ? index + journeyColorRamp.length : index];
}
