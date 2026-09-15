import { PassengerCapacityRequirement, PatientMobility } from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { TripStopKind } from '@redinfo/shared';

/** Batch-loads what `checkTripCapacity`/`walkTripStops` need for every leg
 * currently boarding — one query, never per stop. Shared by `TripsService`
 * (reading a trip's current issues) and `TripStopsService` (checking a
 * candidate stop set before committing it). */
export async function loadPassengerRequirements(
  prisma: PrismaService,
  legIds: string[],
): Promise<Map<string, PassengerCapacityRequirement>> {
  const map = new Map<string, PassengerCapacityRequirement>();
  if (legIds.length === 0) return map;

  const legs = await prisma.transportLeg.findMany({
    where: { id: { in: legIds } },
    select: {
      id: true,
      transportRequest: { select: { escortTravels: true, patient: { select: { mobility: true } } } },
    },
  });

  for (const leg of legs) {
    const mobility = leg.transportRequest.patient.mobility as PatientMobility;
    const escort = leg.transportRequest.escortTravels ? 1 : 0;
    map.set(leg.id, {
      wheelchairPositions: mobility === PatientMobility.WHEELCHAIR ? 1 : 0,
      stretcherPositions: mobility === PatientMobility.STRETCHER ? 1 : 0,
      seats: (mobility === PatientMobility.AMBULATORY ? 1 : 0) + escort,
    });
  }
  return map;
}

/** Distinct leg ids a `PICKUP` stop set needs passenger data for. */
export function pickupLegIds(stops: { kind: string; transportLegId: string | null }[]): string[] {
  return [
    ...new Set(
      stops.filter((s) => s.kind === TripStopKind.PICKUP && s.transportLegId).map((s) => s.transportLegId as string),
    ),
  ];
}
