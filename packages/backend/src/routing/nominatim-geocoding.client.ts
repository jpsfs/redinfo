import { Injectable, Logger } from '@nestjs/common';
import { assertInternalRoutingHost } from './routing-host-guard';
import { Coordinates } from './routing.interface';

export const GEOCODING_BASE_URL_ENV = 'GEOCODING_BASE_URL';
const DEFAULT_BASE_URL = 'http://nominatim:8080';

/**
 * Thin HTTP client over the self-hosted Nominatim instance (#231). No
 * caching here — that's `GeocodeCacheService`'s job; this only ever asks
 * Nominatim, never remembers.
 *
 * Every failure returns `null` rather than throwing, same posture as
 * `RouteDistanceService` — a geocode failing is a "por calcular", never a
 * block.
 */
@Injectable()
export class NominatimGeocodingClient {
  private readonly logger = new Logger(NominatimGeocodingClient.name);

  constructor(
    private readonly baseUrl: string = process.env[GEOCODING_BASE_URL_ENV] ?? DEFAULT_BASE_URL,
  ) {
    assertInternalRoutingHost(this.baseUrl, GEOCODING_BASE_URL_ENV);
  }

  async geocode(address: string): Promise<Coordinates | null> {
    const url = new URL('/search', this.baseUrl);
    url.searchParams.set('q', address);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '1');
    url.searchParams.set('countrycodes', 'pt');

    try {
      const response = await fetch(url);
      if (!response.ok) {
        this.logger.warn(`Nominatim answered ${response.status} for "${address}".`);
        return null;
      }

      const results = (await response.json()) as Array<{ lat: string; lon: string }>;
      const first = results[0];
      if (!first) return null;

      const latitude = Number(first.lat);
      const longitude = Number(first.lon);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

      return { latitude, longitude };
    } catch (cause) {
      this.logger.warn(`Could not geocode "${address}": ${(cause as Error).message}`);
      return null;
    }
  }
}
