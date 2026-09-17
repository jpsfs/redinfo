import { Injectable } from '@nestjs/common';
import { TrafficDayType, TrafficFactorSource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CorridorEndpoint, corridorKeyFor } from './traffic-corridor-key.util';

export interface CorridorFactorLookup {
  /** Always usable directly against a free-flow duration — `1.0` when no row was found. */
  factor: number;
  /** `null` means `factor` above defaulted to `1.0` rather than coming from a sampled row — see this service's `lookup` doc comment. */
  source: TrafficFactorSource | null;
  sampledAt: Date | null;
}

/**
 * Reads and writes `TrafficCorridorFactor` (#232). The only place that
 * knows the table's `corridorKey` trick — every caller works in terms of
 * `CorridorEndpoint`, never the stored key directly.
 */
@Injectable()
export class TrafficCorridorFactorService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * A missing row degrades to `factor: 1.0` explicitly, with `source: null`
   * so a caller can tell "no traffic effect" apart from "no data" — the
   * acceptance criterion this exists for. Never throws for a corridor with
   * no sample yet; that is the normal, expected state for a corridor before
   * its first quarterly sample.
   */
  async lookup(
    origin: CorridorEndpoint,
    destination: CorridorEndpoint,
    departureBucket: number,
    dayType: TrafficDayType,
  ): Promise<CorridorFactorLookup> {
    const corridorKey = corridorKeyFor(origin, destination);
    const row = await this.prisma.trafficCorridorFactor.findUnique({
      where: { corridorKey_departureBucket_dayType: { corridorKey, departureBucket, dayType } },
    });
    if (!row) return { factor: 1, source: null, sampledAt: null };
    return { factor: row.factor, source: row.source, sampledAt: row.sampledAt };
  }

  /**
   * Writes one corridor/bucket/day-type factor — the same call whatever
   * `source` is. That is the whole "swappable source" requirement: replacing
   * a corridor's PURCHASED factors with MEASURED ones later is this method
   * called again with a different `source`, never a different code path.
   */
  async upsert(
    origin: CorridorEndpoint,
    destination: CorridorEndpoint,
    departureBucket: number,
    dayType: TrafficDayType,
    factor: number,
    source: TrafficFactorSource,
    sampledAt: Date,
  ): Promise<void> {
    const corridorKey = corridorKeyFor(origin, destination);
    await this.prisma.trafficCorridorFactor.upsert({
      where: { corridorKey_departureBucket_dayType: { corridorKey, departureBucket, dayType } },
      create: {
        corridorKey,
        departureBucket,
        dayType,
        factor,
        source,
        sampledAt,
        originLocalityId: origin.kind === 'locality' ? origin.localityId : null,
        originFacilityId: origin.kind === 'facility' ? origin.facilityId : null,
        destinationLocalityId: destination.kind === 'locality' ? destination.localityId : null,
        destinationFacilityId: destination.kind === 'facility' ? destination.facilityId : null,
      },
      update: { factor, source, sampledAt },
    });
  }
}
