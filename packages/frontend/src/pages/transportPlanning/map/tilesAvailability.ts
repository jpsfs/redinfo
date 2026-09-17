/** Where the self-hosted basemap lives — proxied same-origin exactly like
 * `/api/`, never a third-party host (nginx/nginx.conf, vite.config.ts). */
export const TILES_URL = '/tiles/portugal.pmtiles';

/**
 * Whether the basemap file is actually there. `scripts/prepare-basemap.sh`
 * is a one-off, run by hand (#247 stage 4, mirroring `prepare-osrm-data.sh`)
 * — a delegation that hasn't run it yet must still get a fully working
 * board, just without the map panel. A `HEAD` request is enough: nginx
 * answers 404 for a missing file without reading it, so this costs nothing
 * on either a hit or a miss.
 */
export async function probeTilesAvailable(url: string = TILES_URL): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}
