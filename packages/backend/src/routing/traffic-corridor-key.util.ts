/**
 * A corridor's endpoint (#232) — a `Locality` centroid or a `Facility`'s own
 * coordinates, never a raw address. See `routing.module.ts`'s doc comment
 * for why that boundary matters.
 */
export type CorridorEndpoint =
  | { kind: 'locality'; localityId: string }
  | { kind: 'facility'; facilityId: string };

/**
 * The dedup key `TrafficCorridorFactor.corridorKey` stores — see that
 * model's doc comment for why a computed key exists at all instead of a
 * compound unique straight over the four nullable endpoint columns. Origin
 * and destination are not interchangeable (a corridor has a direction), so
 * this is not symmetric.
 */
export function corridorKeyFor(origin: CorridorEndpoint, destination: CorridorEndpoint): string {
  return `${endpointKey(origin)}>${endpointKey(destination)}`;
}

function endpointKey(endpoint: CorridorEndpoint): string {
  return endpoint.kind === 'locality' ? `L:${endpoint.localityId}` : `F:${endpoint.facilityId}`;
}
