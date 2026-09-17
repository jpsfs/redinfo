import { OsrmRouteClient } from './osrm-route.client';

describe('OsrmRouteClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  const PORTO = { latitude: 41.1496, longitude: -8.6109 };
  const BRAGA = { latitude: 41.5454, longitude: -8.4265 };
  const BARCELOS = { latitude: 41.5388, longitude: -8.6151 };

  it('refuses to construct against an external host', () => {
    expect(() => new OsrmRouteClient('https://router.project-osrm.org')).toThrow(/external host/);
  });

  it('builds the coordinate string and asks for a full polyline6 overview', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ code: 'Ok', routes: [{ geometry: 'abc123' }] }),
    });
    global.fetch = fetchMock as any;

    const client = new OsrmRouteClient('http://osrm:5000');
    await client.route([PORTO, BRAGA, BARCELOS]);

    const requestedUrl = new URL(fetchMock.mock.calls[0][0]);
    expect(requestedUrl.pathname).toBe(
      `/route/v1/driving/${PORTO.longitude},${PORTO.latitude};${BRAGA.longitude},${BRAGA.latitude};${BARCELOS.longitude},${BARCELOS.latitude}`,
    );
    expect(requestedUrl.searchParams.get('overview')).toBe('full');
    expect(requestedUrl.searchParams.get('geometries')).toBe('polyline6');
  });

  it('returns the first route’s encoded geometry', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ code: 'Ok', routes: [{ geometry: '_p~iF~ps|U_ulLnnqC_mqNvxq`@' }] }),
    }) as any;

    const client = new OsrmRouteClient('http://osrm:5000');
    await expect(client.route([PORTO, BRAGA])).resolves.toBe('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
  });

  it('returns null on an HTTP error', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 }) as any;

    const client = new OsrmRouteClient('http://osrm:5000');
    await expect(client.route([PORTO, BRAGA])).resolves.toBeNull();
  });

  it('returns null when OSRM reports a non-Ok code', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ code: 'NoRoute' }),
    }) as any;

    const client = new OsrmRouteClient('http://osrm:5000');
    await expect(client.route([PORTO, BRAGA])).resolves.toBeNull();
  });

  it('returns null rather than throwing when the network call rejects', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as any;

    const client = new OsrmRouteClient('http://osrm:5000');
    await expect(client.route([PORTO, BRAGA])).resolves.toBeNull();
  });

  it('short-circuits on fewer than two points rather than calling OSRM', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as any;

    const client = new OsrmRouteClient('http://osrm:5000');
    await expect(client.route([PORTO])).resolves.toBeNull();
    await expect(client.route([])).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
