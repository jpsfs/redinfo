/**
 * The constraint the whole self-hosted routing/geocoding design rests on
 * (#231): a patient address must never leave the building, which means never
 * reaching a third-party host. A config change is exactly how that would be
 * lost silently, so this is checked at construction, not just documented —
 * `NominatimGeocodingClient`/`OsrmMatrixClient` both call it before storing
 * the base URL they were given.
 *
 * `localhost`/`127.0.0.1` are allowed alongside the compose service names so
 * a backend run outside Docker (a laptop, a test) can still point at a
 * locally-bound OSRM/Nominatim.
 */
export const INTERNAL_ROUTING_HOSTS = ['osrm', 'nominatim', 'localhost', '127.0.0.1'];

export function assertInternalRoutingHost(url: string, label: string): void {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    throw new Error(`${label} "${url}" is not a valid URL.`);
  }

  if (!INTERNAL_ROUTING_HOSTS.includes(hostname)) {
    throw new Error(
      `${label} "${url}" points at an external host ("${hostname}"). Patient addresses ` +
        `never leave the building — routing/geocoding may only point at ` +
        `${INTERNAL_ROUTING_HOSTS.join(', ')}.`,
    );
  }
}
