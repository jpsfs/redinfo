import { PrismaService } from '../prisma/prisma.service';
import { CorridorEndpointResolver } from './corridor-endpoint-resolver.service';

describe('CorridorEndpointResolver', () => {
  let prisma: { locality: { findUnique: jest.Mock }; facility: { findUnique: jest.Mock } };
  let resolver: CorridorEndpointResolver;

  beforeEach(() => {
    prisma = { locality: { findUnique: jest.fn() }, facility: { findUnique: jest.fn() } };
    resolver = new CorridorEndpointResolver(prisma as unknown as PrismaService);
  });

  it("uses a locality's own coordinate when it has one", async () => {
    prisma.locality.findUnique.mockResolvedValue({
      latitude: 41.1,
      longitude: -8.6,
      municipality: { latitude: 41.0, longitude: -8.5 },
    });

    const result = await resolver.resolve({ kind: 'locality', localityId: 'loc-1' });

    expect(result).toEqual({ latitude: 41.1, longitude: -8.6 });
  });

  it("falls back to the municipality centroid when a locality has no coordinate of its own", async () => {
    prisma.locality.findUnique.mockResolvedValue({
      latitude: null,
      longitude: null,
      municipality: { latitude: 41.0, longitude: -8.5 },
    });

    const result = await resolver.resolve({ kind: 'locality', localityId: 'loc-1' });

    expect(result).toEqual({ latitude: 41.0, longitude: -8.5 });
  });

  it("uses a facility's own coordinate when it has one", async () => {
    prisma.facility.findUnique.mockResolvedValue({
      latitude: 41.2,
      longitude: -8.7,
      municipality: { latitude: 41.0, longitude: -8.5 },
    });

    const result = await resolver.resolve({ kind: 'facility', facilityId: 'fac-1' });

    expect(result).toEqual({ latitude: 41.2, longitude: -8.7 });
  });

  it('returns null when the endpoint does not exist', async () => {
    prisma.facility.findUnique.mockResolvedValue(null);

    const result = await resolver.resolve({ kind: 'facility', facilityId: 'missing' });

    expect(result).toBeNull();
  });

  it('returns null when neither the endpoint nor its municipality has a coordinate', async () => {
    prisma.locality.findUnique.mockResolvedValue({ latitude: null, longitude: null, municipality: null });

    const result = await resolver.resolve({ kind: 'locality', localityId: 'loc-1' });

    expect(result).toBeNull();
  });
});
