import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { TrafficDayType, TrafficFactorSource } from '@prisma/client';
import { addIsoDays, isoDayOfWeek, toIsoDate } from '../utils/date.util';
import { shiftBoundaryToInstant } from '../utils/timezone.util';
import { PrismaService } from '../prisma/prisma.service';
import { CorridorEndpointResolver } from './corridor-endpoint-resolver.service';
import { ROUTING_SERVICE, RoutingService } from './routing.interface';
import { CorridorEndpoint, corridorKeyFor } from './traffic-corridor-key.util';
import { TrafficCorridorFactorService } from './traffic-corridor-factor.service';
import { TrafficQueueService } from './traffic-queue.service';
import { TRAFFIC_SAMPLING_CLIENT, TrafficSamplingClient } from './traffic-sampling.interface';

const DAY_TYPES = [TrafficDayType.WEEKDAY, TrafficDayType.SATURDAY, TrafficDayType.SUNDAY_HOLIDAY];

/** ISO weekday (`isoDayOfWeek`'s 0=Sunday..6=Saturday) each `TrafficDayType` is sampled against. Holidays aren't separately dated for sampling — `SUNDAY_HOLIDAY` groups them with Sunday because that's the traffic pattern they share. */
const REFERENCE_WEEKDAY: Record<TrafficDayType, number> = {
  [TrafficDayType.WEEKDAY]: 1, // Monday
  [TrafficDayType.SATURDAY]: 6,
  [TrafficDayType.SUNDAY_HOLIDAY]: 0,
};

/** The next date (inclusive of `from`) on `weekday`, as `YYYY-MM-DD`. */
function nextIsoDateOnWeekday(from: Date, weekday: number): string {
  let cursor = toIsoDate(from);
  for (let i = 0; i < 7; i++) {
    if (isoDayOfWeek(cursor) === weekday) return cursor;
    cursor = addIsoDays(cursor, 1);
  }
  return cursor; // unreachable — every weekday appears within 7 days
}

/**
 * The quarterly refresh job (#232): samples `TrafficSamplingClient` across
 * every departure hour and day type for every corridor this delegation
 * actually cares about, and stores the sampled-vs-free-flow ratio as that
 * corridor's `TrafficCorridorFactor` rows.
 *
 * `corridorsToSample` is deliberately narrow — never the whole ~3,500-row
 * national `Locality` table crossed with every transport-destination
 * `Facility`, which would blow the "a few thousand calls a quarter" budget
 * before a single departure bucket is even considered. It reads
 * `Patient.localityId` (public geography, already unsealed for planning —
 * see `packages/backend/CLAUDE.md`'s `Patients` entry) joined through
 * `TransportRequest.destinationFacilityId`: exactly the corridors this
 * delegation has actually been asked to serve. Never `PatientIdentity`
 * (name/telephone/home address) — see this class's own test for the
 * assertion this stays true.
 */
@Injectable()
export class TrafficCorridorSamplerService implements OnModuleInit {
  private readonly logger = new Logger(TrafficCorridorSamplerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: TrafficQueueService,
    private readonly endpoints: CorridorEndpointResolver,
    @Inject(ROUTING_SERVICE) private readonly routing: RoutingService,
    @Inject(TRAFFIC_SAMPLING_CLIENT) private readonly samplingClient: TrafficSamplingClient,
    private readonly corridorFactors: TrafficCorridorFactorService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.work(() => this.runQuarterlySample());
  }

  async runQuarterlySample(): Promise<void> {
    const corridors = await this.corridorsToSample();
    this.logger.log(`Sampling ${corridors.length} corridor(s) across departure buckets and day types.`);
    for (const corridor of corridors) {
      await this.sampleCorridor(corridor.origin, corridor.destination);
    }
  }

  /**
   * `select` only ever reaches `patient.localityId` — a scalar column, not
   * the sealed `PatientIdentity` blob. Deduplicated in memory rather than
   * via Prisma's `distinct` (which can't dedupe across a joined field):
   * referral volume here is inherently small, the same volume argument the
   * ticket itself makes for why planning traffic is a solved-cheaply
   * problem in the first place.
   */
  async corridorsToSample(): Promise<{ origin: CorridorEndpoint; destination: CorridorEndpoint }[]> {
    const requests = await this.prisma.transportRequest.findMany({
      select: { destinationFacilityId: true, patient: { select: { localityId: true } } },
    });

    const corridors = new Map<string, { origin: CorridorEndpoint; destination: CorridorEndpoint }>();
    for (const request of requests) {
      const localityId = request.patient.localityId;
      if (!localityId) continue;

      const origin: CorridorEndpoint = { kind: 'locality', localityId };
      const destination: CorridorEndpoint = { kind: 'facility', facilityId: request.destinationFacilityId };
      corridors.set(corridorKeyFor(origin, destination), { origin, destination });
    }
    return [...corridors.values()];
  }

  private async sampleCorridor(origin: CorridorEndpoint, destination: CorridorEndpoint): Promise<void> {
    const [originCoords, destinationCoords] = await Promise.all([
      this.endpoints.resolve(origin),
      this.endpoints.resolve(destination),
    ]);
    if (!originCoords || !destinationCoords) return;

    const [[freeFlow]] = await this.routing.distanceMatrix([originCoords], [destinationCoords]);
    if (!freeFlow || freeFlow.durationSeconds <= 0) return;

    for (const dayType of DAY_TYPES) {
      const referenceDate = nextIsoDateOnWeekday(new Date(), REFERENCE_WEEKDAY[dayType]);
      for (let hour = 0; hour < 24; hour++) {
        const departAt = shiftBoundaryToInstant(referenceDate, hour * 60);
        const sample = await this.samplingClient.sampleTravelTime(originCoords, destinationCoords, departAt);
        if (!sample) continue; // no vendor answer for this slot — leave any existing factor as-is rather than overwrite it with a guess

        const factor = sample.durationSeconds / freeFlow.durationSeconds;
        await this.corridorFactors.upsert(origin, destination, hour, dayType, factor, TrafficFactorSource.PURCHASED, new Date());
      }
    }
  }
}
