import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GeocodeCacheService } from './geocode-cache.service';
import { NominatimGeocodingClient } from './nominatim-geocoding.client';
import { OsrmMatrixClient } from './osrm-matrix.client';
import { OsrmRouteClient } from './osrm-route.client';
import { OsrmRoutingService } from './osrm-routing.service';

/**
 * Integration coverage for the self-hosted routing/geocoding foundation
 * (#231), against real Postgres, OSRM and Nominatim.
 *
 * Skipped unless DATABASE_URL is set, same as every other integration spec.
 * Additionally soft-skips (logs and returns, rather than failing) when OSRM
 * or Nominatim aren't reachable — deliberately, because the Nominatim
 * import of a whole country can legitimately still be running the first
 * time this suite runs against a fresh checkout, and that is a data step,
 * not a code defect this suite exists to catch.
 */
const describeIntegration = process.env.DATABASE_URL ? describe : describe.skip;

async function reachable(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return response.ok;
  } catch {
    return false;
  }
}

describeIntegration('Routing and geocoding (integration)', () => {
  const prisma = new PrismaClient() as unknown as PrismaService;
  const geocodingClient = new NominatimGeocodingClient();
  const matrixClient = new OsrmMatrixClient();
  const routeClient = new OsrmRouteClient();
  const cache = new GeocodeCacheService(prisma);
  const service = new OsrmRoutingService(geocodingClient, matrixClient, routeClient, cache);

  let osrmUp = false;
  let nominatimUp = false;

  beforeAll(async () => {
    // OSRM has no dedicated health endpoint; any well-formed `/route` request
    // answers 200 whether or not the two points are routable, so it doubles
    // as a plain "the server is up" probe — same trick the `osrm` service's
    // own compose healthcheck uses.
    osrmUp = await reachable('http://osrm:5000/route/v1/driving/0,0;0,1');
    nominatimUp = await reachable('http://nominatim:8080/status.php');
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  afterEach(async () => {
    await prisma.geocodedAddress.deleteMany({ where: { rawAddress: { contains: 'Sé' } } });
  });

  it('geocodes an address, and a second call hits the cache', async () => {
    if (!nominatimUp) {
      console.warn('Nominatim not reachable — skipping (likely still importing).');
      return;
    }

    const spy = jest.spyOn(geocodingClient, 'geocode');
    const address = 'Rua de São Sebastião, Braga';

    const first = await service.geocode(address);
    expect(first).not.toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);

    const second = await service.geocode(address);
    expect(second).toEqual(first);
    expect(spy).toHaveBeenCalledTimes(1); // cache hit — no second HTTP call
  });

  it('returns a matrix fast enough to sit inside a planning loop, for ~20 stops', async () => {
    if (!osrmUp) {
      console.warn('OSRM not reachable — skipping.');
      return;
    }

    // A scatter of points across the Norte region — real coordinates, not
    // meaningful destinations.
    const stops = Array.from({ length: 20 }, (_, i) => ({
      latitude: 41.15 + i * 0.01,
      longitude: -8.61 + i * 0.01,
    }));

    const start = Date.now();
    const matrix = await service.distanceMatrix(stops, stops);
    const elapsedMs = Date.now() - start;

    expect(matrix).toHaveLength(20);
    expect(matrix[0]).toHaveLength(20);
    expect(elapsedMs).toBeLessThan(5000);
  });

  it('flags an out-of-region pair as an estimate', async () => {
    if (!osrmUp) {
      console.warn('OSRM not reachable — skipping.');
      return;
    }

    const porto = { latitude: 41.1496, longitude: -8.6109 };
    const madrid = { latitude: 40.4168, longitude: -3.7038 };

    const [[cell]] = await service.distanceMatrix([porto], [madrid]);
    expect(cell.estimated).toBe(true);
  });

  it('returns a drawable polyline6 route through an ordered stop sequence (#247 stage 4)', async () => {
    if (!osrmUp) {
      console.warn('OSRM not reachable — skipping.');
      return;
    }

    const braga = { latitude: 41.5454, longitude: -8.4265 };
    const barcelos = { latitude: 41.5388, longitude: -8.6151 };

    const geometry = await service.routeGeometry([braga, barcelos]);
    expect(typeof geometry).toBe('string');
    expect(geometry!.length).toBeGreaterThan(0);
  });
});
