import { PrismaClient, TrafficDayType, TrafficFactorSource } from '@prisma/client';
import { PatientMobility } from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { HolidaysService } from '../availability/holidays.service';
import { CorridorEndpointResolver } from './corridor-endpoint-resolver.service';
import { GeocodeCacheService } from './geocode-cache.service';
import { NominatimGeocodingClient } from './nominatim-geocoding.client';
import { OsrmMatrixClient } from './osrm-matrix.client';
import { OsrmRouteClient } from './osrm-route.client';
import { OsrmRoutingService } from './osrm-routing.service';
import { PlannedDurationService } from './planned-duration.service';
import { CorridorEndpoint } from './traffic-corridor-key.util';
import { TrafficCorridorFactorService } from './traffic-corridor-factor.service';
import { TrafficCorridorSamplerService } from './traffic-corridor-sampler.service';
import { TrafficQueueService } from './traffic-queue.service';
import { DisabledTrafficSamplingClient } from './disabled-traffic-sampling.client';

/**
 * Integration coverage for the traffic correction table (#232), against real
 * Postgres and OSRM — the unit specs cover the same behaviour against
 * mocked Prisma; this proves what only a real database answers: the
 * `corridorKey` dedup trick actually prevents a duplicate row (Postgres
 * treats `NULL` as distinct from `NULL` in a unique index, which a mocked
 * Prisma can't catch), and a real corridor's factor genuinely changes the
 * planned duration OSRM reports.
 *
 * Skipped unless DATABASE_URL is set, and soft-skips (rather than failing)
 * the OSRM-dependent tests when OSRM isn't reachable — same posture as
 * `routing.integration.spec.ts`.
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

describeIntegration('Traffic correction table (integration)', () => {
  const prisma = new PrismaClient() as unknown as PrismaService;
  const factors = new TrafficCorridorFactorService(prisma);
  const resolver = new CorridorEndpointResolver(prisma);
  const holidays = new HolidaysService(prisma);
  const geocodingClient = new NominatimGeocodingClient();
  const matrixClient = new OsrmMatrixClient();
  const routeClient = new OsrmRouteClient();
  const cache = new GeocodeCacheService(prisma);
  const routing = new OsrmRoutingService(geocodingClient, matrixClient, routeClient, cache);
  const planner = new PlannedDurationService(routing, resolver, factors, holidays);

  const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

  let osrmUp = false;
  let municipality: { id: string };
  let locality: { id: string };
  let facility: { id: string };
  let origin: CorridorEndpoint;
  let destination: CorridorEndpoint;

  beforeAll(async () => {
    osrmUp = await reachable('http://osrm:5000/route/v1/driving/0,0;0,1');
    await prisma.$connect();

    municipality = await prisma.municipality.create({
      data: {
        ineCode: `PT-TRAFFIC-${RUN}`,
        name: `Traffic Test ${RUN}`,
        district: `District ${RUN}`,
        latitude: 41.15,
        longitude: -8.61,
      },
    });
    locality = await prisma.locality.create({
      data: {
        name: `Locality ${RUN}`,
        municipalityId: municipality.id,
        searchName: `locality ${RUN}`.toLowerCase(),
        latitude: 41.15,
        longitude: -8.61,
      },
    });
    facility = await prisma.facility.create({
      data: {
        name: `Facility ${RUN}`,
        municipalityId: municipality.id,
        latitude: 41.2,
        longitude: -8.55,
        isTransportDestination: true,
      },
    });
    origin = { kind: 'locality', localityId: locality.id };
    destination = { kind: 'facility', facilityId: facility.id };
  });

  afterAll(async () => {
    await prisma.trafficCorridorFactor.deleteMany({ where: { originLocalityId: locality.id } });
    await prisma.facility.delete({ where: { id: facility.id } });
    await prisma.locality.delete({ where: { id: locality.id } });
    await prisma.municipality.delete({ where: { id: municipality.id } });
    await prisma.$disconnect();
  });

  afterEach(async () => {
    await prisma.trafficCorridorFactor.deleteMany({ where: { originLocalityId: locality.id } });
  });

  it('upserts a corridor idempotently — a compound key over four nullable columns would not, since Postgres treats NULL as distinct from NULL', async () => {
    const sampledAt = new Date();
    await factors.upsert(origin, destination, 8, TrafficDayType.WEEKDAY, 1.5, TrafficFactorSource.PURCHASED, sampledAt);
    await factors.upsert(origin, destination, 8, TrafficDayType.WEEKDAY, 1.5, TrafficFactorSource.PURCHASED, sampledAt);

    const rows = await prisma.trafficCorridorFactor.findMany({ where: { originLocalityId: locality.id } });
    expect(rows).toHaveLength(1);
  });

  it('replaces a corridor wholesale with a different source in place, never as a second competing row', async () => {
    await factors.upsert(origin, destination, 8, TrafficDayType.WEEKDAY, 1.5, TrafficFactorSource.PURCHASED, new Date());
    await factors.upsert(origin, destination, 8, TrafficDayType.WEEKDAY, 1.1, TrafficFactorSource.MEASURED, new Date());

    const rows = await prisma.trafficCorridorFactor.findMany({ where: { originLocalityId: locality.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].factor).toBe(1.1);
    expect(rows[0].source).toBe(TrafficFactorSource.MEASURED);
  });

  it('lookup degrades a missing factor to 1.0 with a null source against a real database', async () => {
    const result = await factors.lookup(origin, destination, 8, TrafficDayType.WEEKDAY);
    expect(result).toEqual({ factor: 1, source: null, sampledAt: null });
  });

  it('a materially different planned duration for an 08:00 vs an 11:00 departure on the same real corridor', async () => {
    if (!osrmUp) {
      console.warn('OSRM not reachable — skipping.');
      return;
    }

    await factors.upsert(origin, destination, 8, TrafficDayType.WEEKDAY, 2.0, TrafficFactorSource.PURCHASED, new Date());
    await factors.upsert(origin, destination, 11, TrafficDayType.WEEKDAY, 1.0, TrafficFactorSource.PURCHASED, new Date());

    // Monday 08:00 and 11:00 Lisbon time (WEST, UTC+1).
    const morning = await planner.plan(origin, destination, new Date('2026-09-14T07:00:00.000Z'));
    const late = await planner.plan(origin, destination, new Date('2026-09-14T10:00:00.000Z'));

    expect(morning.durationSeconds).toBeGreaterThan(0);
    expect(morning.durationSeconds).toBeCloseTo(late.durationSeconds * 2, 0);
    expect(morning.corridorFactorSource).toBe(TrafficFactorSource.PURCHASED);
  });

  describe('TrafficCorridorSamplerService.corridorsToSample', () => {
    const queue = { work: async () => undefined } as unknown as TrafficQueueService;
    const samplingClient = new DisabledTrafficSamplingClient();
    const sampler = new TrafficCorridorSamplerService(prisma, queue, resolver, routing, samplingClient, factors);

    let coordinator: { id: string };
    let patient: { id: string };
    let requester: { id: string };

    beforeAll(async () => {
      coordinator = await prisma.user.create({
        data: {
          email: `coordinator.${RUN}@traffic.test`,
          firstName: 'Coordinator',
          lastName: 'Test',
          roles: [],
          isActive: true,
        },
      });
      patient = await prisma.patient.create({
        data: { mobility: PatientMobility.WHEELCHAIR as never, createdById: coordinator.id, localityId: locality.id },
      });
      requester = await prisma.organisation.create({ data: { name: `Requester ${RUN}`, isRequester: true } });
      await prisma.transportRequest.create({
        data: {
          batchReference: `Batch ${RUN}`,
          communicatedAt: new Date(),
          requesterAccountCode: `ACC-${RUN}`,
          responseDueAt: new Date(),
          externalServiceNumber: `SVC-${RUN}`,
          appointmentAt: new Date(),
          requestingOrganisationId: requester.id,
          payingOrganisationId: requester.id,
          patientId: patient.id,
          occurrenceType: 'CONSULTA',
          requestedVehicleType: 'TRANSPORTE',
          originAddress: 'Rua de Teste',
          destinationFacilityId: facility.id,
          createdById: coordinator.id,
        },
      });
    });

    afterAll(async () => {
      await prisma.transportRequest.deleteMany({ where: { requestingOrganisationId: requester.id } });
      await prisma.organisation.delete({ where: { id: requester.id } });
      await prisma.patient.delete({ where: { id: patient.id } });
      await prisma.user.delete({ where: { id: coordinator.id } });
    });

    it('discovers the real referral corridor via the actual join, never touching the sealed patient identity', async () => {
      const corridors = await sampler.corridorsToSample();

      expect(corridors).toContainEqual({ origin, destination });
    });
  });
});
