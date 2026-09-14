import { FALLBACK_AVERAGE_SPEED_KMH, OsrmRoutingService } from './osrm-routing.service';

describe('OsrmRoutingService', () => {
  const PORTO = { latitude: 41.1496, longitude: -8.6109 };
  const BRAGA = { latitude: 41.5454, longitude: -8.4265 };
  const MADRID = { latitude: 40.4168, longitude: -3.7038 }; // out of the loaded region

  const buildService = () => {
    const geocodingClient = { geocode: jest.fn() };
    const matrixClient = { table: jest.fn() };
    const cache = { get: jest.fn(), put: jest.fn() };
    const service = new OsrmRoutingService(geocodingClient as any, matrixClient as any, cache as any);
    return { service, geocodingClient, matrixClient, cache };
  };

  describe('geocode', () => {
    it('returns a cache hit without calling Nominatim', async () => {
      const { service, geocodingClient, cache } = buildService();
      cache.get.mockResolvedValue(PORTO);

      await expect(service.geocode('Rua da Sé, Porto')).resolves.toEqual(PORTO);
      expect(geocodingClient.geocode).not.toHaveBeenCalled();
    });

    it('asks Nominatim and caches the result on a cache miss', async () => {
      const { service, geocodingClient, cache } = buildService();
      cache.get.mockResolvedValue(null);
      geocodingClient.geocode.mockResolvedValue(PORTO);

      await expect(service.geocode('Rua da Sé, Porto')).resolves.toEqual(PORTO);
      expect(cache.put).toHaveBeenCalledWith('Rua da Sé, Porto', PORTO);
    });

    it('never caches a miss', async () => {
      const { service, geocodingClient, cache } = buildService();
      cache.get.mockResolvedValue(null);
      geocodingClient.geocode.mockResolvedValue(null);

      await expect(service.geocode('nowhere at all')).resolves.toBeNull();
      expect(cache.put).not.toHaveBeenCalled();
    });
  });

  describe('distanceMatrix', () => {
    it('passes through a real OSRM cell unflagged', async () => {
      const { service, matrixClient } = buildService();
      matrixClient.table.mockResolvedValue([[{ durationSeconds: 1234, distanceMeters: 56000 }]]);

      await expect(service.distanceMatrix([PORTO], [BRAGA])).resolves.toEqual([
        [{ durationSeconds: 1234, distanceMeters: 56000, estimated: false }],
      ]);
    });

    it('falls back to a flagged straight-line estimate when OSRM has no route', async () => {
      const { service, matrixClient } = buildService();
      matrixClient.table.mockResolvedValue([[{ durationSeconds: null, distanceMeters: null }]]);

      const [[cell]] = await service.distanceMatrix([PORTO], [MADRID]);
      expect(cell.estimated).toBe(true);
      expect(cell.distanceMeters).toBeGreaterThan(0);
      expect(cell.durationSeconds).toBeCloseTo(
        (cell.distanceMeters / 1000 / FALLBACK_AVERAGE_SPEED_KMH) * 3600,
      );
    });

    it('falls back for every cell when OSRM is unreachable', async () => {
      const { service, matrixClient } = buildService();
      matrixClient.table.mockResolvedValue(null);

      const [[cell]] = await service.distanceMatrix([PORTO], [BRAGA]);
      expect(cell.estimated).toBe(true);
    });
  });
});
