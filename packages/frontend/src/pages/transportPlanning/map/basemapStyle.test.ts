import { describe, expect, it } from 'vitest';
import { buildBasemapStyle } from './basemapStyle';

describe('buildBasemapStyle', () => {
  it('prefixes the tiles URL with the pmtiles:// protocol', () => {
    const style = buildBasemapStyle('/tiles/portugal.pmtiles');
    expect(style.sources.basemap).toMatchObject({ type: 'vector', url: 'pmtiles:///tiles/portugal.pmtiles' });
  });

  it('never references a glyphs or sprite URL — both would reach a third-party host', () => {
    const style = buildBasemapStyle('/tiles/portugal.pmtiles');
    expect(style.glyphs).toBeUndefined();
    expect(style.sprite).toBeUndefined();
  });

  it('draws every layer off the same self-hosted basemap source, never a second source', () => {
    const style = buildBasemapStyle('/tiles/portugal.pmtiles');
    const sourceIds = new Set(Object.keys(style.sources));
    for (const layer of style.layers) {
      if ('source' in layer) expect(sourceIds.has(layer.source as string)).toBe(true);
    }
  });
});
