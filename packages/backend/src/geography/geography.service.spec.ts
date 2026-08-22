import { NotFoundException } from '@nestjs/common';
import { LOCALITY_SEARCH_LIMIT } from '@redinfo/shared';
import { GeographyService } from './geography.service';
import { PrismaService } from '../prisma/prisma.service';

// ── Finding the place a call came from ─────────────────────────────────────────
//
// A crew types two or three letters with one thumb. Two rules make that work:
// every token has to appear somewhere in the folded name, so word order does
// not matter; and a name that *starts* with what was typed beats one that
// merely contains it.

const COIMBRA = {
  id: 'mun-coimbra',
  ineCode: '0603',
  name: 'Coimbra',
  district: 'Coimbra',
  latitude: 40.2111,
  longitude: -8.4289,
};

const locality = (name: string, searchName: string, id = name) => ({
  id,
  name,
  searchName,
  municipalityId: COIMBRA.id,
  municipality: COIMBRA,
});

function makeService(rows: unknown[] = []) {
  const prisma = {
    locality: {
      findMany: jest.fn(() => Promise.resolve(rows)),
      findUnique: jest.fn(() => Promise.resolve(rows[0] ?? null)),
    },
    municipality: { findMany: jest.fn(() => Promise.resolve([COIMBRA])) },
  } as unknown as PrismaService;

  return { service: new GeographyService(prisma), prisma };
}

describe('searching localities', () => {
  it('asks the database for every token of the query', async () => {
    const { service, prisma } = makeService();

    await service.searchLocalities('martinho bispo');

    expect(prisma.locality.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { searchName: { contains: 'martinho' } },
            { searchName: { contains: 'bispo' } },
          ],
        },
      }),
    );
  });

  it('folds accents and punctuation out of the query', async () => {
    const { service, prisma } = makeService();

    await service.searchLocalities('Condeixa-a-Nova');

    expect(prisma.locality.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { searchName: { contains: 'condeixa' } },
            { searchName: { contains: 'a' } },
            { searchName: { contains: 'nova' } },
          ],
        },
      }),
    );
  });

  it('offers names that start with the query before names that contain it', async () => {
    const { service } = makeService([
      locality('Vila Nova de Coimbra', 'vila nova de coimbra'),
      locality('Coimbra', 'coimbra'),
    ]);

    const result = await service.searchLocalities('coimbra');

    expect(result.map((entry) => entry.name)).toEqual(['Coimbra', 'Vila Nova de Coimbra']);
  });

  it('breaks ties alphabetically, in Portuguese collation', async () => {
    const { service } = makeService([
      locality('Óbidos', 'obidos'),
      locality('Abrantes', 'abrantes'),
    ]);

    const result = await service.searchLocalities('zzz-no-prefix-match');

    expect(result.map((entry) => entry.name)).toEqual(['Abrantes', 'Óbidos']);
  });

  it('returns the alphabetical head of the list for an empty query', async () => {
    const { service, prisma } = makeService([locality('Abrantes', 'abrantes')]);

    const result = await service.searchLocalities('');

    // No `where` at all: an empty picker is worse than a starting point.
    expect(prisma.locality.findMany).toHaveBeenCalledWith(
      expect.not.objectContaining({ where: expect.anything() }),
    );
    expect(result).toHaveLength(1);
  });

  it('treats a query of only punctuation as no query', async () => {
    const { service, prisma } = makeService();

    await service.searchLocalities('---');

    expect(prisma.locality.findMany).toHaveBeenCalledWith(
      expect.not.objectContaining({ where: expect.anything() }),
    );
  });

  it('never returns more than a phone list, whatever the caller asks for', async () => {
    const rows = Array.from({ length: 200 }, (_, index) =>
      locality(`Aldeia ${index}`, `aldeia ${index}`, `id-${index}`),
    );
    const { service } = makeService(rows);

    await expect(service.searchLocalities('aldeia', 1000)).resolves.toHaveLength(
      LOCALITY_SEARCH_LIMIT,
    );
    await expect(service.searchLocalities('aldeia', 0)).resolves.toHaveLength(1);
  });

  it('carries the municipality, so the picker can show concelho and distrito', async () => {
    const { service } = makeService([locality('Ceira', 'ceira')]);

    const [entry] = await service.searchLocalities('ceira');

    expect(entry.municipality).toMatchObject({ name: 'Coimbra', district: 'Coimbra' });
  });
});

describe('resolving a locality', () => {
  it('is 404 when it does not exist', async () => {
    const { service } = makeService();
    await expect(service.findLocality('gone')).rejects.toThrow(NotFoundException);
    await expect(service.municipalityForLocality('gone')).rejects.toThrow(NotFoundException);
  });

  it('hands back the municipality a hospital list is measured from', async () => {
    const { service } = makeService([locality('Taveiro', 'taveiro')]);

    await expect(service.municipalityForLocality('Taveiro')).resolves.toMatchObject({
      name: 'Coimbra',
      latitude: 40.2111,
    });
  });
});

describe('listing municipalities', () => {
  it('orders them by district then name, for a grouped picker', async () => {
    const { service, prisma } = makeService();

    await service.listMunicipalities();

    expect(prisma.municipality.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ district: 'asc' }, { name: 'asc' }] }),
    );
  });
});

describe('nearest localities', () => {
  const FAR_AWAY = {
    id: 'mun-faro',
    ineCode: '0808',
    name: 'Faro',
    district: 'Faro',
    latitude: 37.0194,
    longitude: -7.9304,
  };

  function makeNearestService() {
    const prisma = {
      municipality: { findMany: jest.fn(() => Promise.resolve([FAR_AWAY, COIMBRA])) },
      locality: {
        findMany: jest.fn(() =>
          Promise.resolve([
            { ...locality('Faro city', 'faro city', 'l-faro'), municipalityId: FAR_AWAY.id, municipality: FAR_AWAY },
            locality('Ceira', 'ceira', 'l-ceira'),
          ]),
        ),
      },
    } as unknown as PrismaService;
    return { service: new GeographyService(prisma), prisma };
  }

  it('offers the closest municipality’s localities first', async () => {
    const { service } = makeNearestService();

    // Standing in Coimbra: Coimbra's localities come before Faro's, whatever
    // order the database returned them in.
    const result = await service.nearestLocalities(40.2111, -8.4289);

    expect(result[0].id).toBe('l-ceira');
  });

  it('only asks for localities of the nearest few municipalities', async () => {
    const { service, prisma } = makeNearestService();

    await service.nearestLocalities(40.2111, -8.4289);

    const where = (prisma.locality.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.municipalityId.in).toHaveLength(2);
  });

  it('refuses a point that is not on the globe', async () => {
    const { service } = makeNearestService();

    await expect(service.nearestLocalities(91, 0)).rejects.toThrow(/off the globe/i);
    await expect(service.nearestLocalities(0, 181)).rejects.toThrow(/off the globe/i);
    await expect(service.nearestLocalities(Number.NaN, 0)).rejects.toThrow(/must be numbers/i);
  });
});
