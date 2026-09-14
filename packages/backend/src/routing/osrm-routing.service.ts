import { Injectable } from '@nestjs/common';
import { distanceInKm } from '@redinfo/shared';
import { GeocodeCacheService } from './geocode-cache.service';
import { NominatimGeocodingClient } from './nominatim-geocoding.client';
import { OsrmMatrixClient } from './osrm-matrix.client';
import { Coordinates, RoutingMatrixCell, RoutingService } from './routing.interface';

/**
 * Assumed regional-road speed for the straight-line fallback, kilometres per
 * hour. Not a measured figure — a planner overriding the number by hand is
 * exactly what `estimated: true` is for; this only needs to be "roughly
 * right", not precise (#231).
 */
export const FALLBACK_AVERAGE_SPEED_KMH = 60;

/**
 * OSRM + Nominatim over a self-hosted OpenStreetMap extract (#231).
 *
 * **Why OSRM over Valhalla**: at this scale (≤10 vehicles, ~20 stops in a
 * planning loop, no need for anything beyond a car-profile duration/distance
 * matrix) OSRM's extract pipeline is a fixed three-command sequence
 * (`osrm-extract` → `osrm-partition` → `osrm-customize`, MLD algorithm,
 * see `scripts/prepare-osrm-data.sh`) against the stock `car.lua` profile,
 * with no separate tile-authoring step Valhalla needs, and its `/table`
 * endpoint returns exactly the shape this service needs in one call.
 *
 * Implements `RoutingService` rather than being called directly, so a
 * future engine swap only ever touches `RoutingModule`'s provider wiring.
 */
@Injectable()
export class OsrmRoutingService implements RoutingService {
  constructor(
    private readonly geocodingClient: NominatimGeocodingClient,
    private readonly matrixClient: OsrmMatrixClient,
    private readonly cache: GeocodeCacheService,
  ) {}

  /** Cache hit → return; miss → ask Nominatim, cache a real result, never cache a miss. */
  async geocode(address: string): Promise<Coordinates | null> {
    const cached = await this.cache.get(address);
    if (cached) return cached;

    const found = await this.geocodingClient.geocode(address);
    if (found) await this.cache.put(address, found);
    return found;
  }

  async distanceMatrix(
    origins: Coordinates[],
    destinations: Coordinates[],
    // Accepted for interface stability with a future traffic-aware engine —
    // OSRM has no notion of time-of-day, so this is currently unused.
    _departAt?: Date,
  ): Promise<RoutingMatrixCell[][]> {
    const table = await this.matrixClient.table(origins, destinations);

    return origins.map((origin, i) =>
      destinations.map((destination, j) => {
        const cell = table?.[i]?.[j];
        if (cell && cell.durationSeconds !== null && cell.distanceMeters !== null) {
          return {
            durationSeconds: cell.durationSeconds,
            distanceMeters: cell.distanceMeters,
            estimated: false,
          };
        }
        return this.straightLineEstimate(origin, destination);
      }),
    );
  }

  /**
   * The rare out-of-region job (perhaps one or two a year, per the ticket) —
   * clearly flagged so a planner knows to sanity-check or override it by
   * hand. Not engineered beyond this.
   */
  private straightLineEstimate(origin: Coordinates, destination: Coordinates): RoutingMatrixCell {
    const distanceKm = distanceInKm(origin, destination);
    const distanceMeters = distanceKm * 1000;
    const durationSeconds = (distanceKm / FALLBACK_AVERAGE_SPEED_KMH) * 3600;
    return { durationSeconds, distanceMeters, estimated: true };
  }
}
