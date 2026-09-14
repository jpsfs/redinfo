import { Module } from '@nestjs/common';
import { GeocodeCacheService } from './geocode-cache.service';
import { NominatimGeocodingClient } from './nominatim-geocoding.client';
import { OsrmMatrixClient } from './osrm-matrix.client';
import { OsrmRoutingService } from './osrm-routing.service';
import { ROUTING_SERVICE } from './routing.interface';

/**
 * The self-hosted routing/geocoding foundation (#231). `PrismaModule` is
 * `@Global` so it isn't imported here.
 *
 * `NominatimGeocodingClient`/`OsrmMatrixClient` are factories for the same
 * reason `InemModule`'s `InemApiClient`/`IdentityCipher` are: each takes a
 * plain string-with-a-default constructor arg, and `useClass` would have
 * Nest try to inject that string by type and fail to start.
 *
 * Consumers should depend on `ROUTING_SERVICE` (the `RoutingService`
 * interface), never on `OsrmRoutingService` directly — that indirection is
 * the whole point of the interface, see its doc comment.
 */
@Module({
  providers: [
    { provide: NominatimGeocodingClient, useFactory: () => new NominatimGeocodingClient() },
    { provide: OsrmMatrixClient, useFactory: () => new OsrmMatrixClient() },
    GeocodeCacheService,
    { provide: ROUTING_SERVICE, useClass: OsrmRoutingService },
  ],
  exports: [ROUTING_SERVICE],
})
export class RoutingModule {}
