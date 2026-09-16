import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { TrafficFactorSource } from '@prisma/client';
import { HolidaysService } from '../availability/holidays.service';
import { CorridorEndpointResolver } from './corridor-endpoint-resolver.service';
import { Coordinates, ROUTING_SERVICE, RoutingService } from './routing.interface';
import { CorridorEndpoint } from './traffic-corridor-key.util';
import { TrafficCorridorFactorService } from './traffic-corridor-factor.service';
import { departureBucketFor, localIsoDateFor, trafficDayTypeFor } from './traffic-departure.util';

export interface PlannedDuration {
  /** OSRM free-flow duration × the corridor's traffic factor for `departAt`. */
  durationSeconds: number;
  distanceMeters: number;
  /** True when `RoutingService` could not route this pair and this is a straight-line estimate — see `RoutingMatrixCell`. */
  estimated: boolean;
  corridorFactor: number;
  /** `null` means no sampled factor existed for this corridor/bucket/day-type and `corridorFactor` defaulted to `1.0`. */
  corridorFactorSource: TrafficFactorSource | null;
}

/**
 * The planning path #232 exists for: a planned duration is always
 * `OSRM free-flow duration × corridor factor`, never a live traffic query —
 * see `RoutingModule`'s doc comment for the planning-vs-dispatch split this
 * enforces. `LiveTrafficRoutingService` is the separate, per-request escape
 * hatch for day-of dispatch; nothing here calls it.
 */
@Injectable()
export class PlannedDurationService {
  constructor(
    @Inject(ROUTING_SERVICE) private readonly routing: RoutingService,
    private readonly endpoints: CorridorEndpointResolver,
    private readonly corridorFactors: TrafficCorridorFactorService,
    private readonly holidays: HolidaysService,
  ) {}

  async plan(origin: CorridorEndpoint, destination: CorridorEndpoint, departAt: Date): Promise<PlannedDuration> {
    const [originCoords, destinationCoords] = await Promise.all([
      this.endpoints.resolve(origin),
      this.endpoints.resolve(destination),
    ]);
    if (!originCoords || !destinationCoords) {
      throw new BadRequestException('Corridor endpoint has no known coordinates.');
    }
    return this.planBetweenPoints(
      { coordinates: originCoords, corridor: origin },
      { coordinates: destinationCoords, corridor: destination },
      departAt,
    );
  }

  /**
   * The same planned duration for a pair of *precise* points — a patient's
   * geocoded home address at one end, typically — while the traffic factor is
   * still looked up against public geography only (the locality the address
   * sits in, the facility itself).
   *
   * That split is the whole point, and it is the one #219 recorded as a
   * constraint rather than a detail: the precise address is resolved against
   * the self-hosted engine and never leaves the building, while the corridor a
   * commercial vendor was sampled over is a locality centroid and a facility —
   * public geography already in `Municipality`/`Locality`/`Facility`. So the
   * vendor learns which roads the delegation cares about and nothing about who
   * is being carried.
   *
   * A `null` corridor at either end means no sampled factor can apply, so the
   * duration stays free-flow at `1.0` — visibly, via `corridorFactorSource:
   * null`, never silently, exactly as a missing factor does in `plan`.
   */
  async planBetweenPoints(
    origin: { coordinates: Coordinates; corridor: CorridorEndpoint | null },
    destination: { coordinates: Coordinates; corridor: CorridorEndpoint | null },
    departAt: Date,
  ): Promise<PlannedDuration> {
    // No `departAt` passed to `RoutingService` here — OSRM has no notion of
    // time-of-day, and the interface's `departAt` param exists for a future
    // traffic-aware *engine*, not for this factor multiplication.
    const [[cell]] = await this.routing.distanceMatrix([origin.coordinates], [destination.coordinates]);

    const { factor, source } =
      origin.corridor && destination.corridor
        ? await this.lookupFactor(origin.corridor, destination.corridor, departAt)
        : { factor: 1, source: null };

    return {
      durationSeconds: cell.durationSeconds * factor,
      distanceMeters: cell.distanceMeters,
      estimated: cell.estimated,
      corridorFactor: factor,
      corridorFactorSource: source,
    };
  }

  private async lookupFactor(origin: CorridorEndpoint, destination: CorridorEndpoint, departAt: Date) {
    const isHoliday = await this.holidays.isHoliday(localIsoDateFor(departAt));
    const departureBucket = departureBucketFor(departAt);
    const dayType = trafficDayTypeFor(departAt, isHoliday);
    return this.corridorFactors.lookup(origin, destination, departureBucket, dayType);
  }
}
