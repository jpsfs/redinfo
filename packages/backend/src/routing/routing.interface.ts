/** A point on the map, nothing else — no address, no label. */
export interface Coordinates {
  latitude: number;
  longitude: number;
}

/**
 * One cell of a duration/distance matrix.
 *
 * `estimated` is not in the ticket's own shorthand signature
 * (`{ durationSeconds, distanceMeters }[][]`) but the acceptance criteria are
 * explicit that an out-of-region fallback must be "flagged as such" — a
 * planner overriding a number by hand needs to know which numbers those are.
 */
export interface RoutingMatrixCell {
  durationSeconds: number;
  distanceMeters: number;
  /** True when the engine could not route this pair and this is a straight-line estimate. */
  estimated: boolean;
}

/**
 * The routing/geocoding contract the rest of the app is meant to code
 * against (#231) — never against OSRM or Nominatim directly. That is what
 * keeps the engine swappable, e.g. for Valhalla later, without touching a
 * caller.
 */
export interface RoutingService {
  /** An address's coordinates, or `null` if it could not be found. */
  geocode(address: string): Promise<Coordinates | null>;

  /**
   * Duration (seconds) and distance (metres) from every origin to every
   * destination. `departAt` is accepted for interface stability with a
   * future traffic-aware engine — OSRM has no notion of time-of-day, so it
   * is currently unused.
   */
  distanceMatrix(
    origins: Coordinates[],
    destinations: Coordinates[],
    departAt?: Date,
  ): Promise<RoutingMatrixCell[][]>;

  /**
   * The road path through an ordered list of points, encoded as a
   * polyline6 — the map panel's route layer (#247 stage 4;
   * `decodePolyline` in shared decodes it). `null` with fewer than two
   * points, or when the engine could not route the sequence at all (an
   * out-of-region leg, an outage) — a lane's board card is still fully
   * usable without a route drawn, the same fail-soft posture
   * `distanceMatrix`'s straight-line fallback follows for a duration.
   * Unlike `distanceMatrix`, there is no straight-line fallback here: a
   * straight line between distant stops would misstate the corridor rather
   * than merely estimate a duration, which is exactly what this design
   * decided against (see `docs/plans/planeamento-transportes-redesign.md`
   * §2's "Route geometry" row).
   */
  routeGeometry(points: Coordinates[]): Promise<string | null>;
}

/** DI token — see `RoutingService`'s own doc comment for why this is an interface at all. */
export const ROUTING_SERVICE = Symbol('ROUTING_SERVICE');
