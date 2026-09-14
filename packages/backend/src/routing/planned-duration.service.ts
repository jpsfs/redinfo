import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { TrafficFactorSource } from '@prisma/client';
import { HolidaysService } from '../availability/holidays.service';
import { CorridorEndpointResolver } from './corridor-endpoint-resolver.service';
import { ROUTING_SERVICE, RoutingService } from './routing.interface';
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

    // No `departAt` passed to `RoutingService` here — OSRM has no notion of
    // time-of-day, and the interface's `departAt` param exists for a future
    // traffic-aware *engine*, not for this factor multiplication.
    const [[cell]] = await this.routing.distanceMatrix([originCoords], [destinationCoords]);

    const isHoliday = await this.holidays.isHoliday(localIsoDateFor(departAt));
    const departureBucket = departureBucketFor(departAt);
    const dayType = trafficDayTypeFor(departAt, isHoliday);
    const { factor, source } = await this.corridorFactors.lookup(origin, destination, departureBucket, dayType);

    return {
      durationSeconds: cell.durationSeconds * factor,
      distanceMeters: cell.distanceMeters,
      estimated: cell.estimated,
      corridorFactor: factor,
      corridorFactorSource: source,
    };
  }
}
