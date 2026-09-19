import { Injectable, Logger } from '@nestjs/common';
import { assertInternalRoutingHost } from './routing-host-guard';
import { Coordinates } from './routing.interface';

export const ROUTING_BASE_URL_ENV = 'ROUTING_BASE_URL';
// Exported for `OsrmRouteClient`'s own default constructor arg — same base
// URL, a different endpoint.
export const DEFAULT_BASE_URL = 'http://osrm:5000';

/**
 * How far OSRM is allowed to snap a requested point to the nearest road
 * before that point counts as not actually in the loaded map. Found the hard
 * way: an out-of-region point (e.g. Madrid, against a Portugal-only extract)
 * does not come back `null` — OSRM happily snaps it to the nearest road it
 * *does* have, sometimes hundreds of kilometres away, and answers with a
 * confident-looking number for a route that was never really asked for.
 * `sources[]`/`destinations[].distance` in the `/table` response is exactly
 * that snap distance, so it's checked here rather than trusted at face value.
 */
export const MAX_SNAP_DISTANCE_METERS = 1000;

/** One raw OSRM `/table` cell — `null` means OSRM could not route that pair (including a bad snap). */
export interface OsrmTableCell {
  durationSeconds: number | null;
  distanceMeters: number | null;
}

/**
 * Thin HTTP client over the self-hosted OSRM instance (#231), `/table`
 * only — this app has no use for turn-by-turn directions.
 *
 * Returns `null` for the whole call on failure (network error, non-OK
 * response, malformed body) rather than throwing, so a caller can fall back
 * to the straight-line estimate exactly as it would for one missing cell —
 * see `OsrmRoutingService.distanceMatrix`.
 */
@Injectable()
export class OsrmMatrixClient {
  private readonly logger = new Logger(OsrmMatrixClient.name);

  constructor(
    private readonly baseUrl: string = process.env[ROUTING_BASE_URL_ENV] ?? DEFAULT_BASE_URL,
  ) {
    assertInternalRoutingHost(this.baseUrl, ROUTING_BASE_URL_ENV);
  }

  async table(origins: Coordinates[], destinations: Coordinates[]): Promise<OsrmTableCell[][] | null> {
    if (origins.length === 0 || destinations.length === 0) return [];

    // OSRM takes one flat coordinate list plus index sets for which of them
    // are sources vs. destinations — not two separate lists.
    const all = [...origins, ...destinations];
    const coordinates = all.map((point) => `${point.longitude},${point.latitude}`).join(';');
    const sources = origins.map((_, index) => index).join(';');
    const destinationIndexes = destinations
      .map((_, index) => origins.length + index)
      .join(';');

    const url = new URL(`/table/v1/driving/${coordinates}`, this.baseUrl);
    url.searchParams.set('sources', sources);
    url.searchParams.set('destinations', destinationIndexes);
    url.searchParams.set('annotations', 'duration,distance');

    try {
      const response = await fetch(url);
      if (!response.ok) {
        this.logger.warn(`OSRM answered ${response.status} for a ${origins.length}x${destinations.length} table.`);
        return null;
      }

      const body = (await response.json()) as {
        code: string;
        durations?: (number | null)[][];
        distances?: (number | null)[][];
        sources?: Array<{ distance: number } | null>;
        destinations?: Array<{ distance: number } | null>;
      };
      if (body.code !== 'Ok' || !body.durations || !body.distances) {
        this.logger.warn(`OSRM table response was not usable: ${body.code}`);
        return null;
      }

      const badSnap = (point: { distance: number } | null | undefined) =>
        !point || point.distance > MAX_SNAP_DISTANCE_METERS;

      return body.durations.map((row, i) =>
        row.map((durationSeconds, j) => {
          if (badSnap(body.sources?.[i]) || badSnap(body.destinations?.[j])) {
            return { durationSeconds: null, distanceMeters: null };
          }
          return { durationSeconds, distanceMeters: body.distances![i][j] };
        }),
      );
    } catch (cause) {
      this.logger.warn(`Could not compute a table: ${(cause as Error).message}`);
      return null;
    }
  }
}
