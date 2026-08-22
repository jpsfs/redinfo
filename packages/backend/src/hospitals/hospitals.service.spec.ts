import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { HospitalsService } from './hospitals.service';
import { PrismaService } from '../prisma/prisma.service';
import { GeographyService } from '../geography/geography.service';

// ── The hospital list a victim's destination comes from ────────────────────────
//
// Two rules carry the weight. The picker is ordered by how far each hospital is
// from where the event happened, falling back to the municipality centroid so
// the ordering works before anyone has typed a coordinate. And "delete" retires
// rather than removes as soon as a report names the hospital, because a filed
// report has to keep naming it.

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

const hospital = (
  overrides: Partial<{
    id: string;
    name: string;
    municipalityId: string;
    latitude: number | null;
    longitude: number | null;
    isActive: boolean;
    municipality: typeof COIMBRA;
  }> = {},
) => ({
  id: 'hosp-1',
  name: 'CHUC — Hospital Geral',
  municipalityId: COIMBRA.id,
  latitude: null,
  longitude: null,
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  municipality: COIMBRA,
  ...overrides,
});

function makeService(
  prismaOverrides: Record<string, unknown> = {},
  municipalityForLocality: unknown = COIMBRA,
) {
  const prisma = {
    hospital: {
      findMany: jest.fn(() => Promise.resolve([])),
      findUnique: jest.fn(() => Promise.resolve(hospital())),
      findFirst: jest.fn(() => Promise.resolve(null)),
      create: jest.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve(hospital(args.data as never)),
      ),
      update: jest.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve(hospital(args.data as never)),
      ),
      delete: jest.fn(() => Promise.resolve(hospital())),
      count: jest.fn(() => Promise.resolve(0)),
    },
    municipality: { count: jest.fn(() => Promise.resolve(1)) },
    eventReportVictim: { count: jest.fn(() => Promise.resolve(0)) },
    $transaction: jest.fn((arg: unknown) => Promise.all(arg as Promise<unknown>[])),
    ...prismaOverrides,
  } as unknown as PrismaService;

  const geography = {
    municipalityForLocality: jest.fn(() =>
      municipalityForLocality
        ? Promise.resolve(municipalityForLocality)
        : Promise.reject(new NotFoundException('Locality gone')),
    ),
  } as unknown as GeographyService;

  return { service: new HospitalsService(prisma, geography), prisma, geography };
}

describe('the picker', () => {
  it('orders hospitals by distance from the report’s locality', async () => {
    const { service } = makeService({
      hospital: {
        findMany: jest.fn(() =>
          Promise.resolve([
            hospital({ id: 'far', name: 'Figueira', municipality: FIGUEIRA }),
            hospital({ id: 'near', name: 'Coimbra' }),
          ]),
        ),
      },
    });

    const result = await service.findForPicker('loc-taveiro');

    expect(result.map((entry) => entry.id)).toEqual(['near', 'far']);
    expect(result[0].distanceKm).toBeLessThan(result[1].distanceKm!);
  });

  it('falls back to the municipality centroid, and says the distance is approximate', async () => {
    const { service } = makeService({
      hospital: {
        findMany: jest.fn(() => Promise.resolve([hospital({ latitude: null, longitude: null })])),
      },
    });

    const [entry] = await service.findForPicker('loc-taveiro');

    // Same municipality as the locality, so the centroid distance is zero —
    // and flagged, because it is the concelho's position, not the hospital's.
    expect(entry.distanceKm).toBe(0);
    expect(entry.approximate).toBe(true);
  });

  it('uses the hospital’s own coordinates when it has them', async () => {
    const { service } = makeService({
      hospital: {
        findMany: jest.fn(() =>
          Promise.resolve([hospital({ latitude: 40.1976, longitude: -8.4392 })]),
        ),
      },
    });

    const [entry] = await service.findForPicker('loc-taveiro');

    expect(entry.approximate).toBe(false);
    expect(entry.distanceKm).toBeGreaterThan(0);
  });

  it('rounds the distance to something worth showing a crew', async () => {
    const { service } = makeService({
      hospital: {
        findMany: jest.fn(() =>
          Promise.resolve([hospital({ municipality: FIGUEIRA })]),
        ),
      },
    });

    const [entry] = await service.findForPicker('loc-taveiro');

    expect(entry.distanceKm).toBe(Math.round(entry.distanceKm! * 10) / 10);
  });

  it('offers an alphabetical list when no locality has been chosen yet', async () => {
    const { service, geography } = makeService({
      hospital: {
        findMany: jest.fn(() =>
          Promise.resolve([
            hospital({ id: 'z', name: 'Zamora' }),
            hospital({ id: 'a', name: 'Aveiro' }),
          ]),
        ),
      },
    });

    const result = await service.findForPicker();

    expect(result.map((entry) => entry.id)).toEqual(['a', 'z']);
    expect(result.every((entry) => entry.distanceKm === null)).toBe(true);
    expect(geography.municipalityForLocality).not.toHaveBeenCalled();
  });

  it('offers only active hospitals', async () => {
    const findMany = jest.fn(() => Promise.resolve([]));
    const { service } = makeService({ hospital: { findMany } });

    await service.findForPicker('loc-taveiro');

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } }));
  });

  it('says so when the locality does not exist, rather than silently reordering', async () => {
    const { service } = makeService({}, null);
    await expect(service.findForPicker('loc-gone')).rejects.toThrow(NotFoundException);
  });
});

describe('creating a hospital', () => {
  it('trims the name and defaults to active', async () => {
    const { service, prisma } = makeService();

    await service.create({ name: '  Hospital Novo  ', municipalityId: COIMBRA.id });

    expect(prisma.hospital.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'Hospital Novo', isActive: true }),
      }),
    );
  });

  it('refuses a municipality that does not exist', async () => {
    const { service } = makeService({ municipality: { count: jest.fn(() => Promise.resolve(0)) } });

    await expect(
      service.create({ name: 'Hospital', municipalityId: 'mun-gone' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses a duplicate name in the same municipality', async () => {
    const { service } = makeService({
      hospital: {
        ...(makeService().prisma.hospital as object),
        findFirst: jest.fn(() => Promise.resolve(hospital({ id: 'other' }))),
        create: jest.fn(),
      },
    });

    await expect(
      service.create({ name: 'CHUC — Hospital Geral', municipalityId: COIMBRA.id }),
    ).rejects.toThrow(ConflictException);
  });

  it('refuses half a coordinate', async () => {
    const { service } = makeService();

    await expect(
      service.create({ name: 'Hospital', municipalityId: COIMBRA.id, latitude: 40.19 }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('updating a hospital', () => {
  it('validates the record as it will be, not the patch alone', async () => {
    // The stored hospital has no coordinates; setting only a latitude would
    // leave it half-located, so it is refused even though the patch is small.
    const { service } = makeService();

    await expect(service.update('hosp-1', { latitude: 40.19 })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('accepts a latitude when the stored record already has a longitude', async () => {
    const { service } = makeService({
      hospital: {
        ...(makeService().prisma.hospital as object),
        findUnique: jest.fn(() => Promise.resolve(hospital({ longitude: -8.4392 }))),
      },
    });

    await expect(service.update('hosp-1', { latitude: 40.1976 })).resolves.toMatchObject({
      latitude: 40.1976,
    });
  });

  it('lets a coordinator clear both coordinates', async () => {
    const { service, prisma } = makeService({
      hospital: {
        ...(makeService().prisma.hospital as object),
        findUnique: jest.fn(() =>
          Promise.resolve(hospital({ latitude: 40.19, longitude: -8.43 })),
        ),
      },
    });

    await service.update('hosp-1', { latitude: null, longitude: null });

    expect(prisma.hospital.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ latitude: null, longitude: null }),
      }),
    );
  });

  it('is 404 for a hospital that is not there', async () => {
    const { service } = makeService({
      hospital: {
        ...(makeService().prisma.hospital as object),
        findUnique: jest.fn(() => Promise.resolve(null)),
      },
    });

    await expect(service.update('hosp-gone', { name: 'x' })).rejects.toThrow(NotFoundException);
  });
});

describe('removing a hospital', () => {
  it('deletes one no report has ever named', async () => {
    const { service, prisma } = makeService();

    await service.remove('hosp-1');

    expect(prisma.hospital.delete).toHaveBeenCalled();
    expect(prisma.hospital.update).not.toHaveBeenCalled();
  });

  it('retires one a report names, so the report keeps naming it', async () => {
    const { service, prisma } = makeService({
      eventReportVictim: { count: jest.fn(() => Promise.resolve(3)) },
    });

    const result = await service.remove('hosp-1');

    expect(prisma.hospital.delete).not.toHaveBeenCalled();
    expect(prisma.hospital.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: false } }),
    );
    expect(result.isActive).toBe(false);
  });
});
