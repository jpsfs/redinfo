import { Injectable, Logger } from '@nestjs/common';
import { DelegationSettings, RouteLeg } from '@redinfo/shared';

export const GOOGLE_MAPS_KEY_ENV = 'GOOGLE_MAPS_API_KEY';

/** Where the route has to go through. A waypoint is a place or a coordinate. */
export interface RouteWaypoint {
  /** What to call this leg's end in the stored legs, e.g. "Base" or a hospital. */
  label: string;
  latitude?: number;
  longitude?: number;
  /** Free text, used when there are no coordinates — the Routes API geocodes it. */
  address?: string;
}

/**
 * Kilometres for a run, computed rather than typed.
 *
 * A crew does not reliably return to base — they go to the next call, or
 * somewhere else — so an odometer reading captured in live mode would be wrong
 * more often than right. Live mode captures no kilometres at all; this asks
 * Google for **Base → occurrence → hospital → Base** and stores the legs, so
 * "28 km" is still explainable a year later.
 *
 * **The key never leaves the backend.** A Maps key shipped in the Vite bundle is
 * scraped and billed within days, so the frontend has no key and no call: it
 * gets the answer through us. `scripts/validate-env.js` fails the boot if a
 * `VITE_GOOGLE_MAPS_API_KEY` ever appears.
 *
 * Every failure returns `null` rather than throwing. No network at close is the
 * normal case in a valley, and a run must close anyway — the report shows "por
 * calcular" until the first successful sync fills it in. A missing distance is a
 * warning, never a block.
 */
@Injectable()
export class RouteDistanceService {
  private readonly logger = new Logger(RouteDistanceService.name);

  constructor(private readonly apiKey: string | undefined = process.env[GOOGLE_MAPS_KEY_ENV]) {}

  /** Whether a distance can be computed at all right now. */
  get configured(): boolean {
    return Boolean(this.apiKey);
  }

  /**
   * The legs of `Base → occurrence → hospital → Base`, or null.
   *
   * The hospital leg is skipped when nobody was transported, which makes the
   * round trip Base → occurrence → Base — the shape of most calls.
   */
  async routeForRun(
    settings: DelegationSettings,
    stops: { occurrence?: RouteWaypoint | null; hospital?: RouteWaypoint | null },
  ): Promise<RouteLeg[] | null> {
    if (!stops.occurrence) return null;

    const base: RouteWaypoint = {
      label: settings.baseName,
      latitude: settings.baseLatitude,
      longitude: settings.baseLongitude,
    };

    const waypoints = [base, stops.occurrence, ...(stops.hospital ? [stops.hospital] : []), base];
    return this.legs(waypoints);
  }

  /**
   * One Routes API call per leg.
   *
   * Per leg rather than one call with intermediates, because the stored value is
   * *the legs*: a single multi-stop response gives a total and an ordering, and
   * unpicking which metre belonged to which hop is exactly the ambiguity storing
   * legs was meant to remove. A run has three of them.
   */
  async legs(waypoints: RouteWaypoint[]): Promise<RouteLeg[] | null> {
    if (!this.apiKey) return null;
    if (waypoints.length < 2) return null;

    try {
      const legs: RouteLeg[] = [];
      for (let index = 1; index < waypoints.length; index += 1) {
        const from = waypoints[index - 1];
        const to = waypoints[index];
        const metres = await this.distanceMetres(from, to);
        if (metres === null) return null;
        legs.push({
          from: from.label,
          to: to.label,
          // Whole kilometres, rounded up: the report records a distance
          // travelled, and half a kilometre of it was still travelled.
          kilometres: Math.ceil(metres / 1000),
        });
      }
      return legs;
    } catch (cause) {
      this.logger.warn(`Could not compute a route: ${(cause as Error).message}`);
      return null;
    }
  }

  /**
   * `computeRoutes`, not the legacy Distance Matrix.
   *
   * `X-Goog-FieldMask` is required by the API and is also the cheaper request:
   * asking only for `distanceMeters` keeps us in the free tier's basic band
   * rather than the advanced one polylines fall into.
   */
  private async distanceMetres(
    from: RouteWaypoint,
    to: RouteWaypoint,
  ): Promise<number | null> {
    const response = await fetch(
      'https://routes.googleapis.com/directions/v2:computeRoutes',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey as string,
          'X-Goog-FieldMask': 'routes.distanceMeters',
        },
        body: JSON.stringify({
          origin: toApiWaypoint(from),
          destination: toApiWaypoint(to),
          travelMode: 'DRIVE',
        }),
      },
    );

    if (!response.ok) {
      this.logger.warn(
        `Routes API answered ${response.status} for ${from.label} → ${to.label}.`,
      );
      return null;
    }

    const body = (await response.json()) as {
      routes?: Array<{ distanceMeters?: number }>;
    };
    const metres = body.routes?.[0]?.distanceMeters;
    return typeof metres === 'number' && Number.isFinite(metres) ? metres : null;
  }
}

/** Coordinates when we have them; an address only when we do not. */
function toApiWaypoint(waypoint: RouteWaypoint): Record<string, unknown> {
  if (waypoint.latitude !== undefined && waypoint.longitude !== undefined) {
    return {
      location: {
        latLng: { latitude: waypoint.latitude, longitude: waypoint.longitude },
      },
    };
  }
  return { address: waypoint.address ?? waypoint.label };
}
