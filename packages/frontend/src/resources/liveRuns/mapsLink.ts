/**
 * The handoff into a maps app.
 *
 * One URL for every platform — Google's documented cross-platform form. On
 * Android with Maps installed the OS intent-filters it straight into the app;
 * anywhere else it opens the web map. No user-agent sniffing and no platform
 * branch, because both are wrong on the device nobody tested.
 *
 * `geo:` and `intent://` were considered and rejected: both dead-end outside
 * Android Chrome, and neither can ask for driving directions.
 */

const BASE = 'https://www.google.com/maps/dir/?api=1';

export interface NavigationTarget {
  /** Street and number, as CODU gave it. */
  address?: string | null;
  /** A named place instead of a street — a hospital, mutually exclusive with `address`. */
  name?: string | null;
  /** The locality, which is what makes a street name unambiguous. */
  locality?: string | null;
  /** The municipality, for a street that exists in four villages. */
  municipality?: string | null;
  /**
   * The destination's own coordinates, when known — a hospital that has them
   * skips geocoding entirely, which also skips whatever a same-named place in
   * another country would otherwise resolve to.
   */
  latitude?: number | null;
  longitude?: number | null;
}

/**
 * The destination string, coarsest-to-finest, or null when there is nothing to
 * navigate to.
 *
 * `Portugal` is appended so a street name that also exists in Brazil resolves
 * where the ambulance actually is — Google's geocoder is happy to send a crew to
 * the wrong hemisphere given "Rua da Boavista" and nothing else. Coordinates need
 * no such help: `lat,lng` is unambiguous on its own, so it is returned as-is and
 * takes priority over every text field.
 */
export function navigationQuery(target: NavigationTarget): string | null {
  const { latitude, longitude } = target;
  if (
    latitude !== null &&
    latitude !== undefined &&
    longitude !== null &&
    longitude !== undefined &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude)
  ) {
    return `${latitude},${longitude}`;
  }

  const parts = [target.name, target.address, target.locality, target.municipality]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));

  if (parts.length === 0) return null;
  return [...parts, 'Portugal'].join(', ');
}

/**
 * The full deep link, or null.
 *
 * `encodeURIComponent` and not a template: a real Portuguese address is
 * `R. Dr. Manuel Rodrigues nº 12, 3º Esq.` — full stops, a comma, `º`, and an
 * ordinal — and every one of those breaks a hand-built query string in a
 * different way.
 */
export function mapsUrl(target: NavigationTarget): string | null {
  const query = navigationQuery(target);
  if (!query) return null;
  return `${BASE}&destination=${encodeURIComponent(query)}&travelmode=driving`;
}

/** Whether there is anywhere to navigate to yet. */
export function canNavigate(target: NavigationTarget): boolean {
  return navigationQuery(target) !== null;
}

/**
 * A `tel:` URL for the CODU Dados line.
 *
 * Spaces stripped, because a dialler handed `+351 800 203 264` on some Android
 * builds dials the first fragment and stops.
 */
export function telUrl(phone: string | null | undefined): string | null {
  const digits = phone?.replace(/[^\d+]/g, '') ?? '';
  return digits ? `tel:${digits}` : null;
}
