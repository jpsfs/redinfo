import { NominatimGeocodingClient } from './nominatim-geocoding.client';

describe('NominatimGeocodingClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('refuses to construct against an external host', () => {
    expect(() => new NominatimGeocodingClient('https://nominatim.openstreetmap.org')).toThrow(
      /external host/,
    );
  });

  it('returns coordinates for the first result', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ lat: '41.1496', lon: '-8.6109' }]),
    }) as any;

    const client = new NominatimGeocodingClient('http://nominatim:8080');
    await expect(client.geocode('Rua da Sé, Porto')).resolves.toEqual({
      latitude: 41.1496,
      longitude: -8.6109,
    });
  });

  it('returns null when there are no results', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    }) as any;

    const client = new NominatimGeocodingClient('http://nominatim:8080');
    await expect(client.geocode('nowhere at all')).resolves.toBeNull();
  });

  it('returns null rather than throwing on an HTTP error', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 }) as any;

    const client = new NominatimGeocodingClient('http://nominatim:8080');
    await expect(client.geocode('Rua da Sé, Porto')).resolves.toBeNull();
  });

  it('returns null rather than throwing when the network call rejects', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as any;

    const client = new NominatimGeocodingClient('http://nominatim:8080');
    await expect(client.geocode('Rua da Sé, Porto')).resolves.toBeNull();
  });
});
