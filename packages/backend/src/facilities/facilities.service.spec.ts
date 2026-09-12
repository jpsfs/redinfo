import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { FacilitiesService } from './facilities.service';
import { PrismaService } from '../prisma/prisma.service';
import { GeographyService } from '../geography/geography.service';

// ── Destinations a victim or a transport can be sent to ────────────────────────
//
// One table, two lists that must never mix: `isEmergencyDestination` and
// `isTransportDestination` are independent flags, and every accessor here
// filters by one or the other — there is deliberately no method that hands
// back everything. The picker is ordered by how far each facility is from
// where the event happened, falling back to the municipality centroid so the
// ordering works before anyone has typed a coordinate. And "delete" retires
// rather than removes as soon as a report names the facility, because a
// filed report has to keep naming it.

const COIMBRA = {
  id: 'mun-coimbra',
  ineCode: '0603',
  name: 'Coimbra',
  district: 'Coimbra',
  latitude: 40.2111,
  longitude: -8.4289,
};

const FIGUEIRA = {
  id: 'mun-figueira',
  ineCode: '0605',
  name: 'Figueira da Foz',
  district: 'Coimbra',
  latitude: 40.1508,
  longitude: -8.8556,
};

const facility = (
  overrides: Partial<{
    id: string;
    name: string;
    municipalityId: string;
    addressLine: string | null;
    postalCode: string | null;
    latitude: number | null;
    longitude: number | null;
    isEmergencyDestination: boolean;
    isTransportDestination: boolean;
    isActive: boolean;
    municipality: typeof COIMBRA;
  }> = {},
) => ({
  id: 'fac-1',
  name: 'CHUC — Hospital Geral',
  municipalityId: COIMBRA.id,
  addressLine: null,
  postalCode: null,
  latitude: null,
  longitude: null,
  isEmergencyDestination: true,
  isTransportDestination: false,
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  municipality: COIMBRA,
  ...overrides,
});

function makeService(
  prismaOverrides: Record<string, unknown> = {},
  originForLocality: unknown = COIMBRA,
) {
  const prisma = {
    facility: {
      findMany: jest.fn(() => Promise.resolve([])),
      findUnique: jest.fn(() => Promise.resolve(facility())),
      findFirst: jest.fn(() => Promise.resolve(null)),
      create: jest.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve(facility(args.data as never)),
      ),
      update: jest.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve(facility(args.data as never)),
      ),
      delete: jest.fn(() => Promise.resolve(facility())),
      count: jest.fn(() => Promise.resolve(0)),
    },
    municipality: { count: jest.fn(() => Promise.resolve(1)) },
    eventReportVictim: { count: jest.fn(() => Promise.resolve(0)) },
    $transaction: jest.fn((arg: unknown) => Promise.all(arg as Promise<unknown>[])),
    ...prismaOverrides,
  } as unknown as PrismaService;

  const geography = {
    originForLocality: jest.fn(() =>
      originForLocality
        ? Promise.resolve(originForLocality)
        : Promise.reject(new NotFoundException('Locality gone')),
    ),
  } as unknown as GeographyService;

  return { service: new FacilitiesService(prisma, geography), prisma, geography };
}

describe('no unfiltered accessor', () => {
  it('has no findAll — a method that does not exist cannot be called by accident', () => {
    const methodNames = Object.getOwnPropertyNames(FacilitiesService.prototype);
    expect(methodNames).not.toContain('findAll');
  });

  it('every public list method is one of the flag-filtered accessors', () => {
    // The whitelist below is exhaustive: `findOne`/`create`/`update`/`remove`
    // act on a single known id, not a list, so they carry no risk of leaking
    // the wrong list — only a method that hands back many rows does.
    // `findForPicker` is the private helper both destination pickers share —
    // it always filters by the `flag` its two public callers pass in.
    const listMethods = [
      'findManaged',
      'findEmergencyDestinations',
      'findTransportDestinations',
      'findForPicker',
    ];
    const methodNames = Object.getOwnPropertyNames(FacilitiesService.prototype).filter(
      (name) => name !== 'constructor' && !name.startsWith('_'),
    );
    const publicMethods = methodNames.filter((name) => {
      const descriptor = Object.getOwnPropertyDescriptor(FacilitiesService.prototype, name);
      return typeof descriptor?.value === 'function';
    });
    const unaccountedListLikeMethods = publicMethods.filter(
      (name) => /^find/.test(name) && !listMethods.includes(name) && name !== 'findOne',
    );
    expect(unaccountedListLikeMethods).toEqual([]);
  });
});

describe('the emergency picker', () => {
  it('orders facilities by distance from the report’s locality', async () => {
    const { service } = makeService({
      facility: {
        findMany: jest.fn(() =>
          Promise.resolve([
            facility({ id: 'far', name: 'Figueira', municipality: FIGUEIRA }),
            facility({ id: 'near', name: 'Coimbra' }),
          ]),
        ),
      },
    });

    const result = await service.findEmergencyDestinations('loc-taveiro');

    expect(result.map((entry) => entry.id)).toEqual(['near', 'far']);
    expect(result[0].distanceKm).toBeLessThan(result[1].distanceKm!);
  });

  it('falls back to the municipality centroid, and says the distance is approximate', async () => {
    const { service } = makeService({
      facility: {
        findMany: jest.fn(() => Promise.resolve([facility({ latitude: null, longitude: null })])),
      },
    });

    const [entry] = await service.findEmergencyDestinations('loc-taveiro');

    // Same municipality as the locality, so the centroid distance is zero —
    // and flagged, because it is the concelho's position, not the facility's.
    expect(entry.distanceKm).toBe(0);
    expect(entry.approximate).toBe(true);
  });

  it('uses the facility’s own coordinates when it has them', async () => {
    const { service } = makeService({
      facility: {
        findMany: jest.fn(() =>
          Promise.resolve([facility({ latitude: 40.1976, longitude: -8.4392 })]),
        ),
      },
    });

    const [entry] = await service.findEmergencyDestinations('loc-taveiro');

    expect(entry.approximate).toBe(false);
    expect(entry.distanceKm).toBeGreaterThan(0);
  });

  it('offers an alphabetical list when no locality has been chosen yet', async () => {
    const { service, geography } = makeService({
      facility: {
        findMany: jest.fn(() =>
          Promise.resolve([
            facility({ id: 'z', name: 'Zamora' }),
            facility({ id: 'a', name: 'Aveiro' }),
          ]),
        ),
      },
    });

    const result = await service.findEmergencyDestinations();

    expect(result.map((entry) => entry.id)).toEqual(['a', 'z']);
    expect(result.every((entry) => entry.distanceKm === null)).toBe(true);
    expect(geography.originForLocality).not.toHaveBeenCalled();
  });

  it('offers only active facilities flagged as an emergency destination', async () => {
    const findMany = jest.fn(() => Promise.resolve([]));
    const { service } = makeService({ facility: { findMany } });

    await service.findEmergencyDestinations('loc-taveiro');

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true, isEmergencyDestination: true } }),
    );
  });

  it('says so when the locality does not exist, rather than silently reordering', async () => {
    const { service } = makeService({}, null);
    await expect(service.findEmergencyDestinations('loc-gone')).rejects.toThrow(NotFoundException);
  });
});

describe('the transport picker', () => {
  it('filters on isTransportDestination, not isEmergencyDestination', async () => {
    const findMany = jest.fn(() => Promise.resolve([]));
    const { service } = makeService({ facility: { findMany } });

    await service.findTransportDestinations();

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true, isTransportDestination: true } }),
    );
  });

  it('never returns a facility the emergency picker also returns unless it carries both flags', async () => {
    const emergencyOnly = facility({ id: 'emergency-only', isEmergencyDestination: true, isTransportDestination: false });
    const transportOnly = facility({ id: 'transport-only', isEmergencyDestination: false, isTransportDestination: true });

    const { service } = makeService({
      facility: {
        findMany: jest.fn((args: { where: { isEmergencyDestination?: boolean; isTransportDestination?: boolean } }) =>
          Promise.resolve(
            [emergencyOnly, transportOnly].filter((row) =>
              args.where.isEmergencyDestination ? row.isEmergencyDestination : row.isTransportDestination,
            ),
          ),
        ),
      },
    });

    const emergency = await service.findEmergencyDestinations();
    const transport = await service.findTransportDestinations();

    expect(emergency.map((f) => f.id)).toEqual(['emergency-only']);
    expect(transport.map((f) => f.id)).toEqual(['transport-only']);
  });
});

describe('the admin list', () => {
  it('includes a facility flagged either way, and excludes one flagged neither way', async () => {
    const findMany = jest.fn(() => Promise.resolve([]));
    const { service } = makeService({
      facility: { ...(makeService().prisma.facility as object), findMany },
    });

    await service.findManaged();

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ isEmergencyDestination: true }, { isTransportDestination: true }],
        }),
      }),
    );
  });
});

describe('creating a facility', () => {
  it('trims the name and defaults to active', async () => {
    const { service, prisma } = makeService();

    await service.create({
      name: '  Hospital Novo  ',
      municipalityId: COIMBRA.id,
      isEmergencyDestination: true,
    });

    expect(prisma.facility.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'Hospital Novo', isActive: true }),
      }),
    );
  });

  it('refuses a facility flagged as neither an emergency nor a transport destination', async () => {
    const { service } = makeService();

    await expect(
      service.create({ name: 'Hospital', municipalityId: COIMBRA.id }),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses a transport destination with no coordinates of its own', async () => {
    const { service } = makeService();

    await expect(
      service.create({
        name: 'Clínica Particular',
        municipalityId: COIMBRA.id,
        isTransportDestination: true,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepts a transport destination that carries its own coordinates', async () => {
    const { service, prisma } = makeService();

    await service.create({
      name: 'Clínica Particular',
      municipalityId: COIMBRA.id,
      isTransportDestination: true,
      latitude: 40.1976,
      longitude: -8.4392,
    });

    expect(prisma.facility.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isTransportDestination: true }),
      }),
    );
  });

  it('refuses a municipality that does not exist', async () => {
    const { service } = makeService({ municipality: { count: jest.fn(() => Promise.resolve(0)) } });

    await expect(
      service.create({ name: 'Hospital', municipalityId: 'mun-gone', isEmergencyDestination: true }),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses a duplicate name in the same municipality', async () => {
    const { service } = makeService({
      facility: {
        ...(makeService().prisma.facility as object),
        findFirst: jest.fn(() => Promise.resolve(facility({ id: 'other' }))),
        create: jest.fn(),
      },
    });

    await expect(
      service.create({
        name: 'CHUC — Hospital Geral',
        municipalityId: COIMBRA.id,
        isEmergencyDestination: true,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('refuses half a coordinate', async () => {
    const { service } = makeService();

    await expect(
      service.create({
        name: 'Hospital',
        municipalityId: COIMBRA.id,
        isEmergencyDestination: true,
        latitude: 40.19,
      }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('updating a facility', () => {
  it('validates the record as it will be, not the patch alone', async () => {
    // The stored facility has no coordinates; setting only a latitude would
    // leave it half-located, so it is refused even though the patch is small.
    const { service } = makeService();

    await expect(service.update('fac-1', { latitude: 40.19 })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('refuses clearing both destination flags', async () => {
    const { service } = makeService();

    await expect(
      service.update('fac-1', { isEmergencyDestination: false }),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepts a latitude when the stored record already has a longitude', async () => {
    const { service } = makeService({
      facility: {
        ...(makeService().prisma.facility as object),
        findUnique: jest.fn(() => Promise.resolve(facility({ longitude: -8.4392 }))),
      },
    });

    await expect(service.update('fac-1', { latitude: 40.1976 })).resolves.toMatchObject({
      latitude: 40.1976,
    });
  });

  it('is 404 for a facility that is not there', async () => {
    const { service } = makeService({
      facility: {
        ...(makeService().prisma.facility as object),
        findUnique: jest.fn(() => Promise.resolve(null)),
      },
    });

    await expect(service.update('fac-gone', { name: 'x' })).rejects.toThrow(NotFoundException);
  });
});

describe('removing a facility', () => {
  it('deletes one no report has ever named', async () => {
    const { service, prisma } = makeService();

    await service.remove('fac-1');

    expect(prisma.facility.delete).toHaveBeenCalled();
    expect(prisma.facility.update).not.toHaveBeenCalled();
  });

  it('retires one a report names, so the report keeps naming it', async () => {
    const { service, prisma } = makeService({
      eventReportVictim: { count: jest.fn(() => Promise.resolve(3)) },
    });

    const result = await service.remove('fac-1');

    expect(prisma.facility.delete).not.toHaveBeenCalled();
    expect(prisma.facility.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: false } }),
    );
    expect(result.isActive).toBe(false);
  });
});
