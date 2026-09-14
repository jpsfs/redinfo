import { OsrmMatrixClient } from './osrm-matrix.client';

describe('OsrmMatrixClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  const PORTO = { latitude: 41.1496, longitude: -8.6109 };
  const BRAGA = { latitude: 41.5454, longitude: -8.4265 };

  it('refuses to construct against an external host', () => {
    expect(() => new OsrmMatrixClient('https://router.project-osrm.org')).toThrow(
      /external host/,
    );
  });

  // OSRM's own response for a well-snapped point — `distance` here is the
  // snap distance (input point → matched road), not the route distance.
  const WELL_SNAPPED = { distance: 12 };

  it('builds the coordinate string and source/destination index sets OSRM expects', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          code: 'Ok',
          durations: [[100]],
          distances: [[1000]],
          sources: [WELL_SNAPPED],
          destinations: [WELL_SNAPPED],
        }),
    });
    global.fetch = fetchMock as any;

    const client = new OsrmMatrixClient('http://osrm:5000');
    await client.table([PORTO], [BRAGA]);

    const requestedUrl = new URL(fetchMock.mock.calls[0][0]);
    expect(requestedUrl.pathname).toBe(
      `/table/v1/driving/${PORTO.longitude},${PORTO.latitude};${BRAGA.longitude},${BRAGA.latitude}`,
    );
    expect(requestedUrl.searchParams.get('sources')).toBe('0');
    expect(requestedUrl.searchParams.get('destinations')).toBe('1');
  });

  it('returns a matrix of duration/distance pairs', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          code: 'Ok',
          durations: [[1234]],
          distances: [[56789]],
          sources: [WELL_SNAPPED],
          destinations: [WELL_SNAPPED],
        }),
    }) as any;

    const client = new OsrmMatrixClient('http://osrm:5000');
    await expect(client.table([PORTO], [BRAGA])).resolves.toEqual([
      [{ durationSeconds: 1234, distanceMeters: 56789 }],
    ]);
  });

  it('nulls out a cell whose destination snapped far from where it was actually asked for', async () => {
    // The case that sent us looking at snap distance at all: an out-of-region
    // point (Madrid, against a Portugal-only extract) doesn't come back as
    // an OSRM "no route" — it snaps to the nearest Portuguese road, 200km+
    // away, and returns a confident-looking number for a route nobody asked
    // for. A large `destinations[].distance` is how that's told apart from
    // a genuine, nearby match.
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          code: 'Ok',
          durations: [[11758]],
          distances: [[262751]],
          sources: [WELL_SNAPPED],
          destinations: [{ distance: 243568 }],
        }),
    }) as any;

    const client = new OsrmMatrixClient('http://osrm:5000');
    await expect(client.table([PORTO], [BRAGA])).resolves.toEqual([
      [{ durationSeconds: null, distanceMeters: null }],
    ]);
  });

  it('returns null on an HTTP error', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 }) as any;

    const client = new OsrmMatrixClient('http://osrm:5000');
    await expect(client.table([PORTO], [BRAGA])).resolves.toBeNull();
  });

  it('returns null when OSRM reports a non-Ok code', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ code: 'NoTable' }),
    }) as any;

    const client = new OsrmMatrixClient('http://osrm:5000');
    await expect(client.table([PORTO], [BRAGA])).resolves.toBeNull();
  });

  it('returns null rather than throwing when the network call rejects', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as any;

    const client = new OsrmMatrixClient('http://osrm:5000');
    await expect(client.table([PORTO], [BRAGA])).resolves.toBeNull();
  });

  it('short-circuits with an empty matrix rather than calling OSRM for no stops', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as any;

    const client = new OsrmMatrixClient('http://osrm:5000');
    await expect(client.table([], [BRAGA])).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
