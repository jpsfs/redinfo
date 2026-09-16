import { Injectable, Logger } from '@nestjs/common';
import {
  ArrivalWindowThresholds,
  LegDirection,
  SuggestedLegTimes,
  TransportLeg,
  resolveArrivalWindowThresholds,
  suggestLegTimes,
} from '@redinfo/shared';
import { PlannedDurationService } from '../routing/planned-duration.service';
import { CorridorEndpoint } from '../routing/traffic-corridor-key.util';
import { Coordinates } from '../routing/routing.interface';

export interface LegTravelEstimate {
  travelMinutes: number | null;
  travelEstimated: boolean;
  suggested: SuggestedLegTimes;
}

/**
 * What `estimateMany` needs about a leg's patient: the locality the traffic
 * corridor is keyed by, and the geocoded home point to route from. Both are
 * unsealed columns on `Patient` — the sealed identity blob is never opened
 * here. See `PatientsService.findManyForDisplay`.
 */
export interface LegPatientContext {
  localityId: string | null;
  latitude: number | null;
  longitude: number | null;
}

const NO_ESTIMATE: LegTravelEstimate = {
  travelMinutes: null,
  travelEstimated: false,
  suggested: { pickupAt: null, dropoffAt: null },
};

function coordinatesOf(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): Coordinates | null {
  return typeof latitude === 'number' && typeof longitude === 'number' ? { latitude, longitude } : null;
}

/**
 * Where a leg's end actually is on the ground.
 *
 * A leg stores its own coordinates when it has a literal address — a referral
 * naming a street and a postcode — but routinely stores only a *reference*
 * instead: `destinationFacilityId` for the facility, and nothing at all for
 * the home end, which is the patient's default address. So the leg's own
 * columns are the override, and the referenced row is the normal case; reading
 * only the columns finds a coordinate on almost no real leg.
 *
 * Both fallbacks are still precise points — the facility's own entrance, the
 * patient's own geocoded address — never a locality or municipality centroid.
 * A centroid is fine for ranking which emergency room is nearest and useless
 * for deciding when a vehicle must leave, which is what #219 records about
 * transport destinations needing real geocoded addresses.
 */
function endpointCoordinates(
  own: { latitude: number | null; longitude: number | null },
  facility: { latitude?: number | null; longitude?: number | null } | null | undefined,
  patient: LegPatientContext | undefined,
  isFacilityEnd: boolean,
): Coordinates | null {
  return (
    coordinatesOf(own.latitude, own.longitude) ??
    (isFacilityEnd
      ? coordinatesOf(facility?.latitude, facility?.longitude)
      : coordinatesOf(patient?.latitude, patient?.longitude))
  );
}

/**
 * The two times the crew works out from experience today — when to collect the
 * patient, and when they get home again — computed instead (#219).
 *
 * The delegation's printed daily sheet carries only H.I. (treatment start) and
 * H.F. (expected ready-for-pickup); the driver infers the rest from knowing the
 * roads. That inference is exactly what a travel-time estimate replaces, and
 * why this is decision support rather than a plan: everything here is advisory
 * and the planner's own placement always wins.
 *
 * Deliberately fail-soft. A leg that cannot be routed — no geocode, no road
 * route, no coordinates on the facility — yields nulls, not a fabricated time.
 * A blank the planner fills in is honest; a plausible-looking wrong pickup time
 * silently strands a patient.
 */
@Injectable()
export class TripLegTravelService {
  private readonly logger = new Logger(TripLegTravelService.name);

  constructor(private readonly plannedDuration: PlannedDurationService) {}

  /**
   * One estimate per leg, in parallel. A day's board is tens of legs against a
   * self-hosted OSRM, so the fan-out is a non-issue — the same reasoning
   * `TripsService.getBoard` records for loading each lane's validation
   * separately.
   */
  async estimateMany(
    legs: TransportLeg[],
    patientByLegId: Map<string, LegPatientContext>,
    defaults: ArrivalWindowThresholds,
  ): Promise<Map<string, LegTravelEstimate>> {
    const entries = await Promise.all(
      legs.map(async (leg) => [leg.id, await this.estimate(leg, patientByLegId.get(leg.id), defaults)] as const),
    );
    return new Map(entries);
  }

  private async estimate(
    leg: TransportLeg,
    patient: LegPatientContext | undefined,
    defaults: ArrivalWindowThresholds,
  ): Promise<LegTravelEstimate> {
    // An outbound leg runs home → facility; a return leg runs facility → home.
    const outbound = leg.direction === LegDirection.OUTBOUND;
    const origin = endpointCoordinates(
      { latitude: leg.originLatitude, longitude: leg.originLongitude },
      leg.originFacility,
      patient,
      !outbound,
    );
    const destination = endpointCoordinates(
      { latitude: leg.destinationLatitude, longitude: leg.destinationLongitude },
      leg.destinationFacility,
      patient,
      outbound,
    );
    if (!origin || !destination) return NO_ESTIMATE;

    // The corridor the traffic factor is keyed by is public geography at both
    // ends — the patient's locality, the facility — while the coordinates
    // above are the precise geocoded doors. That split is the point: see
    // `PlannedDurationService.planBetweenPoints`.
    const patientCorridor: CorridorEndpoint | null = patient?.localityId
      ? { kind: 'locality', localityId: patient.localityId }
      : null;
    const facilityId = outbound ? leg.destinationFacilityId : leg.originFacilityId;
    const facilityCorridor: CorridorEndpoint | null = facilityId ? { kind: 'facility', facilityId } : null;
    const [originCorridor, destinationCorridor] = outbound
      ? [patientCorridor, facilityCorridor]
      : [facilityCorridor, patientCorridor];

    // Depart-at only selects the traffic bucket, so the anchored end of the
    // leg is a good enough departure time to look the factor up with — an
    // outbound is factored for the morning it arrives in, a return for the
    // afternoon it leaves in.
    const departAt = new Date(outbound ? leg.appointmentAt : leg.effectiveEstimatedEndAt);

    try {
      const planned = await this.plannedDuration.planBetweenPoints(
        { coordinates: origin, corridor: originCorridor },
        { coordinates: destination, corridor: destinationCorridor },
        departAt,
      );
      const travelMinutes = Math.round(planned.durationSeconds / 60);
      return {
        travelMinutes,
        travelEstimated: planned.estimated,
        suggested: suggestLegTimes({
          direction: leg.direction,
          appointmentAt: leg.appointmentAt,
          effectiveEstimatedEndAt: leg.effectiveEstimatedEndAt,
          travelMinutes,
          thresholds: resolveArrivalWindowThresholds(defaults, leg.destinationFacility),
        }),
      };
    } catch (cause) {
      // The board is still useful without a travel estimate; it is not useful
      // at all if a routing outage 500s the whole day's plan.
      this.logger.warn(`Travel estimate failed for leg ${leg.id}: ${String(cause)}`);
      return NO_ESTIMATE;
    }
  }
}
