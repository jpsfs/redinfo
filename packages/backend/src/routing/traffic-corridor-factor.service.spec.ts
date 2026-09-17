import { TrafficDayType, TrafficFactorSource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CorridorEndpoint } from './traffic-corridor-key.util';
import { TrafficCorridorFactorService } from './traffic-corridor-factor.service';

describe('TrafficCorridorFactorService', () => {
  const origin: CorridorEndpoint = { kind: 'locality', localityId: 'loc-1' };
  const destination: CorridorEndpoint = { kind: 'facility', facilityId: 'fac-1' };

  let prisma: { trafficCorridorFactor: { findUnique: jest.Mock; upsert: jest.Mock } };
  let service: TrafficCorridorFactorService;

  beforeEach(() => {
    prisma = { trafficCorridorFactor: { findUnique: jest.fn(), upsert: jest.fn() } };
    service = new TrafficCorridorFactorService(prisma as unknown as PrismaService);
  });

  describe('lookup', () => {
    it('degrades to factor 1.0 with source null when no row exists — visibly, not silently', async () => {
      prisma.trafficCorridorFactor.findUnique.mockResolvedValue(null);

      const result = await service.lookup(origin, destination, 8, TrafficDayType.WEEKDAY);

      expect(result).toEqual({ factor: 1, source: null, sampledAt: null });
    });

    it('returns the stored factor and its source when a row exists', async () => {
      const sampledAt = new Date('2026-06-01T00:00:00.000Z');
      prisma.trafficCorridorFactor.findUnique.mockResolvedValue({
        factor: 1.6,
        source: TrafficFactorSource.PURCHASED,
        sampledAt,
      });

      const result = await service.lookup(origin, destination, 8, TrafficDayType.WEEKDAY);

      expect(result).toEqual({ factor: 1.6, source: TrafficFactorSource.PURCHASED, sampledAt });
    });

    it('looks up by the corridor key, bucket and day type — origin/destination order matters', async () => {
      prisma.trafficCorridorFactor.findUnique.mockResolvedValue(null);

      await service.lookup(origin, destination, 11, TrafficDayType.SATURDAY);

      expect(prisma.trafficCorridorFactor.findUnique).toHaveBeenCalledWith({
        where: {
          corridorKey_departureBucket_dayType: {
            corridorKey: 'L:loc-1>F:fac-1',
            departureBucket: 11,
            dayType: TrafficDayType.SATURDAY,
          },
        },
      });
    });
  });

  describe('upsert', () => {
    it('writes both endpoint sides for a create, leaving the unused columns null', async () => {
      const sampledAt = new Date('2026-06-01T00:00:00.000Z');

      await service.upsert(origin, destination, 8, TrafficDayType.WEEKDAY, 1.4, TrafficFactorSource.PURCHASED, sampledAt);

      expect(prisma.trafficCorridorFactor.upsert).toHaveBeenCalledWith({
        where: {
          corridorKey_departureBucket_dayType: {
            corridorKey: 'L:loc-1>F:fac-1',
            departureBucket: 8,
            dayType: TrafficDayType.WEEKDAY,
          },
        },
        create: {
          corridorKey: 'L:loc-1>F:fac-1',
          departureBucket: 8,
          dayType: TrafficDayType.WEEKDAY,
          factor: 1.4,
          source: TrafficFactorSource.PURCHASED,
          sampledAt,
          originLocalityId: 'loc-1',
          originFacilityId: null,
          destinationLocalityId: null,
          destinationFacilityId: 'fac-1',
        },
        update: { factor: 1.4, source: TrafficFactorSource.PURCHASED, sampledAt },
      });
    });

    it('replaces a corridor wholesale with a different source via the exact same call shape', async () => {
      const sampledAt = new Date('2026-09-01T00:00:00.000Z');

      await service.upsert(origin, destination, 8, TrafficDayType.WEEKDAY, 1.1, TrafficFactorSource.MEASURED, sampledAt);

      // Same method, same `where`/`update` shape as PURCHASED above — no
      // branch on `source` anywhere in this service.
      expect(prisma.trafficCorridorFactor.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: { factor: 1.1, source: TrafficFactorSource.MEASURED, sampledAt } }),
      );
    });
  });
});
