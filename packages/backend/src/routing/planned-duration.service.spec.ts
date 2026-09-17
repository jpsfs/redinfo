import { BadRequestException } from '@nestjs/common';
import { TrafficDayType, TrafficFactorSource } from '@prisma/client';
import { HolidaysService } from '../availability/holidays.service';
import { CorridorEndpointResolver } from './corridor-endpoint-resolver.service';
import { PlannedDurationService } from './planned-duration.service';
import { RoutingService } from './routing.interface';
import { CorridorEndpoint } from './traffic-corridor-key.util';
import { TrafficCorridorFactorService } from './traffic-corridor-factor.service';

describe('PlannedDurationService', () => {
  const origin: CorridorEndpoint = { kind: 'locality', localityId: 'loc-1' };
  const destination: CorridorEndpoint = { kind: 'facility', facilityId: 'fac-1' };
  const originCoords = { latitude: 41.1, longitude: -8.6 };
  const destinationCoords = { latitude: 41.2, longitude: -8.5 };

  let routing: jest.Mocked<RoutingService>;
  let endpoints: jest.Mocked<CorridorEndpointResolver>;
  let corridorFactors: jest.Mocked<TrafficCorridorFactorService>;
  let holidays: jest.Mocked<HolidaysService>;
  let service: PlannedDurationService;

  beforeEach(() => {
    routing = {
      geocode: jest.fn(),
      distanceMatrix: jest
        .fn()
        .mockResolvedValue([[{ durationSeconds: 1000, distanceMeters: 20000, estimated: false }]]),
      routeGeometry: jest.fn(),
    };
    endpoints = {
      resolve: jest.fn().mockImplementation(async (endpoint: CorridorEndpoint) =>
        endpoint === origin ? originCoords : destinationCoords,
      ),
    } as unknown as jest.Mocked<CorridorEndpointResolver>;
    corridorFactors = {
      lookup: jest.fn(),
      upsert: jest.fn(),
    } as unknown as jest.Mocked<TrafficCorridorFactorService>;
    holidays = { isHoliday: jest.fn().mockResolvedValue(false) } as unknown as jest.Mocked<HolidaysService>;

    service = new PlannedDurationService(routing, endpoints, corridorFactors, holidays);
  });

  it('never sends departAt into the free-flow RoutingService call — OSRM has no notion of time-of-day', async () => {
    corridorFactors.lookup.mockResolvedValue({ factor: 1, source: null, sampledAt: null });

    await service.plan(origin, destination, new Date('2026-09-14T07:00:00.000Z'));

    expect(routing.distanceMatrix).toHaveBeenCalledWith([originCoords], [destinationCoords]);
  });

  it('yields a materially different planned duration for an 08:00 vs an 11:00 departure on the same corridor', async () => {
    corridorFactors.lookup.mockImplementation(async (_o, _d, departureBucket) =>
      departureBucket === 8
        ? { factor: 1.8, source: TrafficFactorSource.PURCHASED, sampledAt: new Date() }
        : { factor: 1.0, source: TrafficFactorSource.PURCHASED, sampledAt: new Date() },
    );

    const morning = await service.plan(origin, destination, new Date('2026-09-14T07:00:00.000Z')); // 08:00 local
    const late = await service.plan(origin, destination, new Date('2026-09-14T10:00:00.000Z')); // 11:00 local

    expect(morning.durationSeconds).toBe(1800);
    expect(late.durationSeconds).toBe(1000);
    expect(morning.durationSeconds).not.toBe(late.durationSeconds);
  });

  it('degrades a missing factor to 1.0 and reports it visibly via a null source, not as a real sampled 1.0', async () => {
    corridorFactors.lookup.mockResolvedValue({ factor: 1, source: null, sampledAt: null });

    const result = await service.plan(origin, destination, new Date('2026-09-14T07:00:00.000Z'));

    expect(result.durationSeconds).toBe(1000); // unchanged from free-flow
    expect(result.corridorFactor).toBe(1);
    expect(result.corridorFactorSource).toBeNull();
  });

  it('distinguishes a real sampled factor of 1.0 from a missing one via source', async () => {
    corridorFactors.lookup.mockResolvedValue({
      factor: 1,
      source: TrafficFactorSource.MEASURED,
      sampledAt: new Date(),
    });

    const result = await service.plan(origin, destination, new Date('2026-09-14T07:00:00.000Z'));

    expect(result.corridorFactor).toBe(1);
    expect(result.corridorFactorSource).toBe(TrafficFactorSource.MEASURED);
  });

  it('rejects a corridor endpoint with no known coordinates rather than silently skipping the factor', async () => {
    endpoints.resolve.mockResolvedValue(null);

    await expect(service.plan(origin, destination, new Date())).rejects.toBeInstanceOf(BadRequestException);
  });

  it('resolves the day type from a holiday even on an ordinary weekday', async () => {
    holidays.isHoliday.mockResolvedValue(true);
    corridorFactors.lookup.mockResolvedValue({ factor: 1, source: null, sampledAt: null });

    await service.plan(origin, destination, new Date('2026-09-16T08:00:00.000Z')); // Wednesday, 09:00 local

    expect(corridorFactors.lookup).toHaveBeenCalledWith(origin, destination, 9, TrafficDayType.SUNDAY_HOLIDAY);
  });
});
