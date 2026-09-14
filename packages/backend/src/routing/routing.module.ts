import { Module } from '@nestjs/common';
import { AvailabilityModule } from '../availability/availability.module';
import { CorridorEndpointResolver } from './corridor-endpoint-resolver.service';
import { DisabledTrafficSamplingClient } from './disabled-traffic-sampling.client';
import { GeocodeCacheService } from './geocode-cache.service';
import { LiveTrafficRoutingService } from './live-traffic-routing.service';
import { NominatimGeocodingClient } from './nominatim-geocoding.client';
import { OsrmMatrixClient } from './osrm-matrix.client';
import { OsrmRoutingService } from './osrm-routing.service';
import { PlannedDurationService } from './planned-duration.service';
import { ROUTING_SERVICE } from './routing.interface';
import { TrafficCorridorFactorService } from './traffic-corridor-factor.service';
import { TrafficCorridorSamplerService } from './traffic-corridor-sampler.service';
import { TrafficQueueService } from './traffic-queue.service';
import { TRAFFIC_SAMPLING_CLIENT } from './traffic-sampling.interface';

/**
 * The self-hosted routing/geocoding foundation (#231), plus its traffic
 * correction layer (#232). `PrismaModule` is `@Global` so it isn't imported
 * here; `AvailabilityModule` is, for `HolidaysService`
 * (`PlannedDurationService`/`TrafficDayType` resolution needs to know
 * whether a departure date is a holiday).
 *
 * `NominatimGeocodingClient`/`OsrmMatrixClient` are factories for the same
 * reason `InemModule`'s `InemApiClient`/`IdentityCipher` are: each takes a
 * plain string-with-a-default constructor arg, and `useClass` would have
 * Nest try to inject that string by type and fail to start.
 *
 * `OsrmRoutingService` is listed as its own provider (not only behind
 * `ROUTING_SERVICE` via `useClass`) and bound to that token with
 * `useExisting`, so it stays directly injectable — `LiveTrafficRoutingService`
 * needs the concrete free-flow engine for its own fallback, without itself
 * ever being reachable through the `ROUTING_SERVICE` token planning depends
 * on. See `LiveTrafficRoutingService`'s doc comment for why that separation
 * is the point of #232's planning-vs-dispatch split.
 *
 * `TRAFFIC_SAMPLING_CLIENT` defaults to `DisabledTrafficSamplingClient` —
 * swap this provider for a real vendor once one is chosen (check licence
 * terms first, per the ticket). Everything else in this module only ever
 * depends on the token, never a concrete vendor class.
 *
 * Consumers should depend on `ROUTING_SERVICE` (the `RoutingService`
 * interface) for planning, never on `OsrmRoutingService` directly — that
 * indirection is the whole point of the interface, see its doc comment.
 */
@Module({
  imports: [AvailabilityModule],
  providers: [
    { provide: NominatimGeocodingClient, useFactory: () => new NominatimGeocodingClient() },
    { provide: OsrmMatrixClient, useFactory: () => new OsrmMatrixClient() },
    GeocodeCacheService,
    OsrmRoutingService,
    { provide: ROUTING_SERVICE, useExisting: OsrmRoutingService },
    { provide: TRAFFIC_SAMPLING_CLIENT, useClass: DisabledTrafficSamplingClient },
    CorridorEndpointResolver,
    TrafficCorridorFactorService,
    PlannedDurationService,
    LiveTrafficRoutingService,
    TrafficQueueService,
    TrafficCorridorSamplerService,
  ],
  exports: [ROUTING_SERVICE, PlannedDurationService, LiveTrafficRoutingService],
})
export class RoutingModule {}
