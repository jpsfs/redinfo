/**
 * A minimal, deliberately loose local stand-in for MapLibre's own
 * `StyleSpecification` — that type lives in `@maplibre/maplibre-gl-style-spec`,
 * a transitive dependency `maplibre-gl` doesn't re-export and this package
 * doesn't declare directly (pnpm's strict `node_modules` refuses to resolve
 * it as a phantom import). `MapPanel` hands this straight to `new
 * MapLibreMap({ style })`, which validates it at runtime regardless — a
 * malformed layer fails loudly in the browser console, not silently.
 */
export interface MinimalMapStyle {
  version: 8;
  sources: Record<string, Record<string, unknown>>;
  layers: Array<Record<string, unknown>>;
  // Present on the real spec but deliberately never set here — see this
  // function's own doc comment. Typed so a test can assert their absence.
  glyphs?: string;
  sprite?: string;
}

/**
 * A minimal MapLibre style over the Protomaps basemap vector schema (#247
 * stage 4) — hand-authored rather than the official `@protomaps/basemaps`
 * npm package, which the design doc's "two new frontend deps"
 * (`maplibre-gl`, `pmtiles`) deliberately doesn't include a third for. Layer
 * names/fields below follow the documented schema
 * (https://docs.protomaps.com/basemaps/layers) for the `basemaps` PMTiles
 * source `scripts/prepare-basemap.sh` produces.
 *
 * No `glyphs`/`sprite` keys and no text layers on purpose: both would reach
 * `protomaps.github.io` for fonts/icons, a third-party host this design's
 * self-hosting constraint exists to avoid (see `RoutingModule`'s doc
 * comment on the same rule for routing/geocoding, and §2 of
 * `docs/plans/planeamento-transportes-redesign.md`). Place and facility
 * names are instead drawn as MUI/DOM markers off the app's own data, not
 * off the vector tile's own label layer — see `MapPanel`.
 */
export function buildBasemapStyle(pmtilesUrl: string): MinimalMapStyle {
  return {
    version: 8,
    sources: {
      basemap: {
        type: 'vector',
        url: `pmtiles://${pmtilesUrl}`,
        attribution:
          '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org">OpenStreetMap</a>',
      },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#F4F1EA' } },
      {
        id: 'earth',
        type: 'fill',
        source: 'basemap',
        'source-layer': 'earth',
        paint: { 'fill-color': '#F7F4EC' },
      },
      {
        id: 'landuse-green',
        type: 'fill',
        source: 'basemap',
        'source-layer': 'landuse',
        filter: ['in', ['get', 'kind'], ['literal', ['forest', 'park', 'nature_reserve', 'national_park', 'cemetery']]],
        paint: { 'fill-color': '#DCE6D5', 'fill-opacity': 0.8 },
      },
      {
        id: 'landuse-built',
        type: 'fill',
        source: 'basemap',
        'source-layer': 'landuse',
        filter: ['in', ['get', 'kind'], ['literal', ['residential', 'commercial', 'industrial']]],
        paint: { 'fill-color': '#EAE6DC', 'fill-opacity': 0.6 },
      },
      {
        id: 'water',
        type: 'fill',
        source: 'basemap',
        'source-layer': 'water',
        paint: { 'fill-color': '#BFD8E8' },
      },
      {
        id: 'buildings',
        type: 'fill',
        source: 'basemap',
        'source-layer': 'buildings',
        minzoom: 15,
        paint: { 'fill-color': '#E4E0D5', 'fill-outline-color': '#D6D1C3' },
      },
      {
        id: 'roads-minor',
        type: 'line',
        source: 'basemap',
        'source-layer': 'roads',
        filter: ['==', ['get', 'kind'], 'minor_road'],
        minzoom: 11,
        paint: { 'line-color': '#FFFFFF', 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.5, 16, 2] },
      },
      {
        id: 'roads-major',
        type: 'line',
        source: 'basemap',
        'source-layer': 'roads',
        filter: ['in', ['get', 'kind'], ['literal', ['highway', 'major_road']]],
        paint: {
          'line-color': '#F5C36B',
          'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.75, 12, 2, 16, 5],
        },
      },
      {
        id: 'boundaries',
        type: 'line',
        source: 'basemap',
        'source-layer': 'boundaries',
        filter: ['==', ['get', 'kind'], 'region'],
        paint: { 'line-color': '#B9B2A0', 'line-width': 1, 'line-dasharray': [3, 2] },
      },
    ],
  };
}
