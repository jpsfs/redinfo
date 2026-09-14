import { TrafficFactorSource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CorridorEndpointResolver } from './corridor-endpoint-resolver.service';
import { RoutingService } from './routing.interface';
import { TrafficCorridorFactorService } from './traffic-corridor-factor.service';
import { TrafficCorridorSamplerService } from './traffic-corridor-sampler.service';
import { TrafficQueueService } from './traffic-queue.service';
import { TrafficSamplingClient } from './traffic-sampling.interface';

describe('TrafficCorridorSamplerService', () => {
  let prisma: { transportRequest: { findMany: jest.Mock } };
  let queue: jest.Mocked<Pick<TrafficQueueService, 'work'>>;
  let endpoints: jest.Mocked<Pick<CorridorEndpointResolver, 'resolve'>>;
  let routing: jest.Mocked<RoutingService>;
  let samplingClient: jest.Mocked<TrafficSamplingClient>;
  let corridorFactors: jest.Mocked<Pick<TrafficCorridorFactorService, 'lookup' | 'upsert'>>;
  let service: TrafficCorridorSamplerService;

  const originCoords = { latitude: 41.1, longitude: -8.6 };
  const destinationCoords = { latitude: 41.2, longitude: -8.5 };

  beforeEach(() => {
    prisma = { transportRequest: { findMany: jest.fn().mockResolvedValue([]) } };
    queue = { work: jest.fn().mockResolvedValue(undefined) };
    endpoints = { resolve: jest.fn().mockResolvedValue(originCoords) };
    routing = {
      geocode: jest.fn(),
      distanceMatrix: jest.fn().mockResolvedValue([[{ durationSeconds: 1000, distanceMeters: 20000, estimated: false }]]),
    };
    samplingClient = { sampleTravelTime: jest.fn().mockResolvedValue(null) };
    corridorFactors = { lookup: jest.fn(), upsert: jest.fn().mockResolvedValue(undefined) };

    service = new TrafficCorridorSamplerService(
      prisma as unknown as PrismaService,
      queue as unknown as TrafficQueueService,
      endpoints as unknown as CorridorEndpointResolver,
      routing,
      samplingClient,
      corridorFactors as unknown as TrafficCorridorFactorService,
    );
  });

  describe('corridorsToSample', () => {
    it('selects only patient.localityId — never a field from the sealed patient identity', async () => {
      prisma.transportRequest.findMany.mockResolvedValue([]);

      await service.corridorsToSample();

      expect(prisma.transportRequest.findMany).toHaveBeenCalledWith({
        select: { destinationFacilityId: true, patient: { select: { localityId: true } } },
      });
    });

    it('skips a request whose patient has no locality on file', async () => {
      prisma.transportRequest.findMany.mockResolvedValue([
        { destinationFacilityId: 'fac-1', patient: { localityId: null } },
      ]);

      const corridors = await service.corridorsToSample();

      expect(corridors).toHaveLength(0);
    });

    it('deduplicates repeat referrals over the same corridor', async () => {
      prisma.transportRequest.findMany.mockResolvedValue([
        { destinationFacilityId: 'fac-1', patient: { localityId: 'loc-1' } },
        { destinationFacilityId: 'fac-1', patient: { localityId: 'loc-1' } },
        { destinationFacilityId: 'fac-2', patient: { localityId: 'loc-1' } },
      ]);

      const corridors = await service.corridorsToSample();

      expect(corridors).toHaveLength(2);
      expect(corridors).toContainEqual({
        origin: { kind: 'locality', localityId: 'loc-1' },
        destination: { kind: 'facility', facilityId: 'fac-1' },
      });
      expect(corridors).toContainEqual({
        origin: { kind: 'locality', localityId: 'loc-1' },
        destination: { kind: 'facility', facilityId: 'fac-2' },
      });
    });
  });

  describe('runQuarterlySample', () => {
    beforeEach(() => {
      prisma.transportRequest.findMany.mockResolvedValue([
        { destinationFacilityId: 'fac-1', patient: { localityId: 'loc-1' } },
      ]);
    });

    it('never calls the sampling client with anything but plain coordinates', async () => {
      samplingClient.sampleTravelTime.mockResolvedValue({ durationSeconds: 1200, distanceMeters: 22000 });

      await service.runQuarterlySample();

      expect(samplingClient.sampleTravelTime).toHaveBeenCalled();
      for (const call of samplingClient.sampleTravelTime.mock.calls) {
        const [origin, destination] = call;
        expect(Object.keys(origin).sort()).toEqual(['latitude', 'longitude']);
        expect(Object.keys(destination).sort()).toEqual(['latitude', 'longitude']);
      }
    });

    it('samples every hour of every day type for one corridor and stores the sampled/free-flow ratio', async () => {
      samplingClient.sampleTravelTime.mockResolvedValue({ durationSeconds: 1500, distanceMeters: 22000 });

      await service.runQuarterlySample();

      // 24 hours × 3 day types for the one discovered corridor.
      expect(samplingClient.sampleTravelTime).toHaveBeenCalledTimes(72);
      expect(corridorFactors.upsert).toHaveBeenCalledTimes(72);
      expect(corridorFactors.upsert).toHaveBeenCalledWith(
        { kind: 'locality', localityId: 'loc-1' },
        { kind: 'facility', facilityId: 'fac-1' },
        expect.any(Number),
        expect.any(String),
        1.5, // 1500 / 1000 free-flow seconds
        TrafficFactorSource.PURCHASED,
        expect.any(Date),
      );
    });

    it('leaves the factor untouched for a slot the vendor has no answer for', async () => {
      samplingClient.sampleTravelTime.mockResolvedValue(null);

      await service.runQuarterlySample();

      expect(corridorFactors.upsert).not.toHaveBeenCalled();
    });

    it('skips a corridor entirely when free-flow duration is degenerate', async () => {
      routing.distanceMatrix.mockResolvedValue([[{ durationSeconds: 0, distanceMeters: 0, estimated: false }]]);
      samplingClient.sampleTravelTime.mockResolvedValue({ durationSeconds: 1500, distanceMeters: 22000 });

      await service.runQuarterlySample();

      expect(samplingClient.sampleTravelTime).not.toHaveBeenCalled();
      expect(corridorFactors.upsert).not.toHaveBeenCalled();
    });

    it('skips a corridor whose endpoint has no known coordinates', async () => {
      endpoints.resolve.mockResolvedValue(null);
      samplingClient.sampleTravelTime.mockResolvedValue({ durationSeconds: 1500, distanceMeters: 22000 });

      await service.runQuarterlySample();

      expect(routing.distanceMatrix).not.toHaveBeenCalled();
      expect(samplingClient.sampleTravelTime).not.toHaveBeenCalled();
    });
  });

  it('registers itself against the queue on module init', async () => {
    await service.onModuleInit();

    expect(queue.work).toHaveBeenCalledWith(expect.any(Function));
  });
});
