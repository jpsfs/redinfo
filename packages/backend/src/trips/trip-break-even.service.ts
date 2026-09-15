import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DwellBreakEven, LegDirection, TripStopKind, TransportRequestOccurrenceType, computeDwellBreakEven, resolveEstimatedEnd } from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { DelegationSettingsService } from '../live-runs/delegation-settings.service';
import { OccurrenceTypePoliciesService } from '../transport-config/occurrence-type-policies.service';
import { ROUTING_SERVICE, RoutingService } from '../routing/routing.interface';

/**
 * "Wait when the round trip back to base exceeds the expected dwell" (#219),
 * read directly off a `DROPOFF` stop of an `OUTBOUND` leg — no need to hunt
 * for a sibling return leg, since `TransportLeg.effectiveEstimatedEndAt`
 * (#233) already carries the same leg's own estimated treatment end. Data
 * only: `computeDwellBreakEven` decides nothing, and neither does this.
 */
@Injectable()
export class TripBreakEvenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly delegationSettings: DelegationSettingsService,
    private readonly occurrenceTypePolicies: OccurrenceTypePoliciesService,
    @Inject(ROUTING_SERVICE) private readonly routing: RoutingService,
  ) {}

  async getBreakEven(tripId: string, stopId: string): Promise<DwellBreakEven> {
    const stop = await this.prisma.tripStop.findUnique({ where: { id: stopId } });
    if (!stop || stop.tripId !== tripId) throw new NotFoundException(`Stop ${stopId} not found on trip ${tripId}`);
    if (stop.kind !== TripStopKind.DROPOFF || !stop.transportLegId) {
      throw new BadRequestException('Break-even only applies to a DROPOFF stop for an assigned leg.');
    }

    const leg = await this.prisma.transportLeg.findUnique({
      where: { id: stop.transportLegId },
      include: {
        destinationFacility: true,
        transportRequest: { select: { occurrenceType: true, appointmentAt: true } },
      },
    });
    if (!leg) throw new NotFoundException(`Transport leg ${stop.transportLegId} not found`);
    if (leg.direction !== LegDirection.OUTBOUND) {
      throw new BadRequestException('Break-even only applies to the outbound leg — a return has no dwell to break even against.');
    }

    const latitude = leg.destinationLatitude ?? leg.destinationFacility?.latitude ?? null;
    const longitude = leg.destinationLongitude ?? leg.destinationFacility?.longitude ?? null;
    if (latitude == null || longitude == null) {
      throw new ConflictException('The destination facility has no coordinates to route from.');
    }

    const [policies, base] = await Promise.all([
      this.occurrenceTypePolicies.getEffectiveMap(),
      this.delegationSettings.get(),
    ]);
    const effectiveEstimatedEndAt = resolveEstimatedEnd(
      leg.transportRequest.appointmentAt.toISOString(),
      leg.transportRequest.occurrenceType as TransportRequestOccurrenceType,
      policies,
      { estimatedEndAt: leg.estimatedEndAt ? leg.estimatedEndAt.toISOString() : null },
    );
    const expectedDwellMinutes = Math.round(
      (new Date(effectiveEstimatedEndAt).getTime() - stop.plannedAt.getTime()) / 60_000,
    );

    const matrix = await this.routing.distanceMatrix(
      [{ latitude, longitude }],
      [{ latitude: base.baseLatitude, longitude: base.baseLongitude }],
    );
    const travelToBaseMinutes = Math.round(matrix[0][0].durationSeconds / 60);

    return computeDwellBreakEven(expectedDwellMinutes, travelToBaseMinutes);
  }
}
