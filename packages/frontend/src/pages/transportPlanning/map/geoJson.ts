/**
 * Minimal local GeoJSON shapes — just enough for the map panel's own
 * sources (#247 stage 4). Deliberately not the ambient `GeoJSON.*`
 * namespace `@types/geojson` (a transitive dependency of maplibre-gl, not
 * one this app declares itself): a local, explicit type is one less thing
 * to depend on resolving through hoisting, and this module only ever needs
 * points and lines, never the rest of the spec.
 */

export interface PointFeature<P> {
  type: 'Feature';
  properties: P;
  geometry: { type: 'Point'; coordinates: [number, number] };
}

export interface LineStringFeature<P> {
  type: 'Feature';
  properties: P;
  geometry: { type: 'LineString'; coordinates: [number, number][] };
}

export interface FeatureCollection<F> {
  type: 'FeatureCollection';
  features: F[];
}
