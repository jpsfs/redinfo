import { Injectable, Logger } from '@nestjs/common';
import { assertInternalRoutingHost } from './routing-host-guard';
import { Coordinates } from './routing.interface';
import { DEFAULT_BASE_URL, ROUTING_BASE_URL_ENV } from './osrm-matrix.client';

/**
 * Thin HTTP client over the self-hosted OSRM instance (#231), `/route`
 * only — the map panel's route geometry (#247 stage 4). Sibling to
 * `OsrmMatrixClient`'s `/table`; kept as its own client rather than folded in
 * because the two endpoints return genuinely different shapes (a
 * duration/distance grid vs. one geometry string) and are asked for at
 * different times (a fresh `/table` on every plan change, a `/route` once
 * per lane when the board is built).
 *
 * Returns `null` on failure (network error, non-OK response, unroutable
 * sequence) rather than throwing — same fail-soft posture as
 * `OsrmMatrixClient.table`, since a lane is still a usable board card
 * without a drawn route.
 */
@Injectable()
export class OsrmRouteClient {
  private readonly logger = new Logger(OsrmRouteClient.name);

  constructor(
    private readonly baseUrl: string = process.env[ROUTING_BASE_URL_ENV] ?? DEFAULT_BASE_URL,
  ) {
    assertInternalRoutingHost(this.baseUrl, ROUTING_BASE_URL_ENV);
  }

  async route(points: Coordinates[]): Promise<string | null> {
    if (points.length < 2) return null;

    const coordinates = points.map((point) => `${point.longitude},${point.latitude}`).join(';');
    const url = new URL(`/route/v1/driving/${coordinates}`, this.baseUrl);
    url.searchParams.set('overview', 'full');
    url.searchParams.set('geometries', 'polyline6');
    // Only the geometry is used — no turn-by-turn steps.
    url.searchParams.set('steps', 'false');

    try {
      const response = await fetch(url);
      if (!response.ok) {
        this.logger.warn(`OSRM answered ${response.status} for a ${points.length}-point route.`);
        return null;
      }

      const body = (await response.json()) as {
        code: string;
        routes?: Array<{ geometry?: string }>;
      };
      if (body.code !== 'Ok' || !body.routes?.[0]?.geometry) {
        this.logger.warn(`OSRM route response was not usable: ${body.code}`);
        return null;
      }

      return body.routes[0].geometry;
    } catch (cause) {
      this.logger.warn(`Could not compute a route: ${(cause as Error).message}`);
      return null;
    }
  }
}
