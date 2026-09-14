import { GeocodeCacheService } from './geocode-cache.service';

describe('GeocodeCacheService', () => {
  const buildService = () => {
    const prisma = {
      geocodedAddress: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
    };
    return { service: new GeocodeCacheService(prisma as any), prisma };
  };

  it('returns null on a cache miss', async () => {
    const { service, prisma } = buildService();
    prisma.geocodedAddress.findUnique.mockResolvedValue(null);

    await expect(service.get('Rua da Sé, Porto')).resolves.toBeNull();
  });

  it('returns coordinates on a cache hit', async () => {
    const { service, prisma } = buildService();
    prisma.geocodedAddress.findUnique.mockResolvedValue({ latitude: 41.1496, longitude: -8.6109 });

    await expect(service.get('Rua da Sé, Porto')).resolves.toEqual({
      latitude: 41.1496,
      longitude: -8.6109,
    });
  });

  it('two spellings of the same address hit the same cache row', async () => {
    const { service, prisma } = buildService();
    prisma.geocodedAddress.findUnique.mockResolvedValue(null);

    await service.get('Rua da Sé, Porto');
    await service.get('  RUA DA SÉ,   PORTO  ');

    const [firstCall, secondCall] = prisma.geocodedAddress.findUnique.mock.calls;
    expect(firstCall[0].where.addressHash).toBe(secondCall[0].where.addressHash);
  });

  it('writes the raw address and coordinates on put', async () => {
    const { service, prisma } = buildService();

    await service.put('Rua da Sé, Porto', { latitude: 41.1496, longitude: -8.6109 });

    expect(prisma.geocodedAddress.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          rawAddress: 'Rua da Sé, Porto',
          latitude: 41.1496,
          longitude: -8.6109,
        }),
      }),
    );
  });
});
