import { NotFoundException } from '@nestjs/common';
import { DEFAULT_DELEGATION_SETTINGS, LOCALITY_SEARCH_LIMIT } from '@redinfo/shared';
import { GeographyService } from './geography.service';
import { PrismaService } from '../prisma/prisma.service';
import { DelegationSettingsService } from '../live-runs/delegation-settings.service';

// ── Finding the place a call came from ─────────────────────────────────────────
//
// A crew types two or three letters with one thumb. Every token has to match
// somewhere — the locality's own folded name, or its municipality's folded
// name or district — so word order and "which name carries the word" both
// stop mattering. What's left, once something matched, is which of the
// matches is actually closest.

const COIMBRA = {
  id: 'mun-coimbra',
  ineCode: '0603',
  name: 'Coimbra',
  district: 'Coimbra',
  latitude: 40.2111,
  longitude: -8.4289,
};

const FARO = {
  id: 'mun-faro',
  ineCode: '0808',
  name: 'Faro',
  district: 'Faro',
  latitude: 37.0194,
  longitude: -7.9304,
};

const BARCELOS = {
  id: 'mun-barcelos',
  ineCode: '0303',
  name: 'Barcelos',
  district: 'Braga',
  latitude: 41.5388,
  longitude: -8.6151,
};

const locality = (name: string, searchName: string, municipality = COIMBRA, id = name) => ({
  id,
  name,
  searchName,
  municipalityId: municipality.id,
  municipality,
});

function makeService(
  rows: unknown[] = [],
  options: {
    municipalities?: unknown[];
    base?: { baseLatitude: number; baseLongitude: number };
  } = {},
) {
  const prisma = {
    locality: {
      findMany: jest.fn(() => Promise.resolve(rows)),
      findUnique: jest.fn(() => Promise.resolve(rows[0] ?? null)),
    },
    municipality: {
      findMany: jest.fn(() => Promise.resolve(options.municipalities ?? [COIMBRA])),
    },
  } as unknown as PrismaService;

  const base = options.base ?? {
    baseLatitude: DEFAULT_DELEGATION_SETTINGS.baseLatitude,
    baseLongitude: DEFAULT_DELEGATION_SETTINGS.baseLongitude,
  };
  const delegationSettings = {
    get: jest.fn(() =>
      Promise.resolve({
        baseName: DEFAULT_DELEGATION_SETTINGS.baseName,
        coduDadosPhone: DEFAULT_DELEGATION_SETTINGS.coduDadosPhone,
        ...base,
      }),
    ),
  } as unknown as DelegationSettingsService;

  return {
    service: new GeographyService(prisma, delegationSettings),
    prisma,
    delegationSettings,
  };
}

describe('searching localities', () => {
  it('asks the database for every token of the query, either arm of the OR', async () => {
    const { service, prisma } = makeService();

    await service.searchLocalities('martinho bispo');

    // Neither token names Coimbra (the only municipality the mock knows), so
    // each token's municipality arm degrades to an empty `in` — never an
    // unconstrained one, which would match every row.
    expect(prisma.locality.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { OR: [{ searchName: { contains: 'martinho' } }, { municipalityId: { in: [] } }] },
            { OR: [{ searchName: { contains: 'bispo' } }, { municipalityId: { in: [] } }] },
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
            { OR: [{ searchName: { contains: 'condeixa' } }, { municipalityId: { in: [] } }] },
            // "a" folds out of "Coimbra" too — the only municipality the mock
            // knows — so its arm is not empty, unlike its neighbours.
            { OR: [{ searchName: { contains: 'a' } }, { municipalityId: { in: ['mun-coimbra'] } }] },
            { OR: [{ searchName: { contains: 'nova' } }, { municipalityId: { in: [] } }] },
          ],
        },
      }),
    );
  });

  it('matches a token against the municipality, not just the locality\'s own name', async () => {
    // "Campo Barcelos": the freguesia's own name never says "Barcelos" — that
    // is the municipality it sits in. The "campo" token matches the locality's
    // name directly; "barcelos" only matches via the municipality.
    const { service, prisma } = makeService([], { municipalities: [COIMBRA, BARCELOS] });

    await service.searchLocalities('campo barcelos');

    expect(prisma.locality.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { OR: [{ searchName: { contains: 'campo' } }, { municipalityId: { in: [] } }] },
            {
              OR: [
                { searchName: { contains: 'barcelos' } },
                { municipalityId: { in: [BARCELOS.id] } },
              ],
            },
          ],
        },
      }),
    );
  });

  it('finds a locality via its district too', async () => {
    const { service, prisma } = makeService([], { municipalities: [COIMBRA, BARCELOS] });

    await service.searchLocalities('braga');

    expect(prisma.locality.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            {
              OR: [
                { searchName: { contains: 'braga' } },
                { municipalityId: { in: [BARCELOS.id] } },
              ],
            },
          ],
        },
      }),
    );
  });

  it('ranks matches by distance from the origin, nearest first', async () => {
    const { service } = makeService([
      locality('Faro city', 'faro city', FARO, 'l-faro'),
      locality('Ceira', 'ceira', COIMBRA, 'l-ceira'),
    ]);

    // Standing in Coimbra: Ceira (Coimbra) must outrank Faro city, regardless
    // of the order the database happened to return them in, and regardless of
    // name — this is not the old prefix/contains ranking.
    const result = await service.searchLocalities('a', LOCALITY_SEARCH_LIMIT, {
      latitude: COIMBRA.latitude,
      longitude: COIMBRA.longitude,
    });

    expect(result.map((entry) => entry.id)).toEqual(['l-ceira', 'l-faro']);
  });

  it('breaks distance ties alphabetically, in Portuguese collation', async () => {
    const { service } = makeService([
      locality('Óbidos', 'obidos', COIMBRA, 'l-obidos'),
      locality('Abrantes', 'abrantes', COIMBRA, 'l-abrantes'),
    ]);

    const result = await service.searchLocalities('zzz-no-match', LOCALITY_SEARCH_LIMIT, {
      latitude: COIMBRA.latitude,
      longitude: COIMBRA.longitude,
    });

    expect(result.map((entry) => entry.name)).toEqual(['Abrantes', 'Óbidos']);
  });

  it('orders the empty-query branch by distance too, not alphabetically', async () => {
    const { service } = makeService([
      locality('Faro city', 'faro city', FARO, 'l-faro'),
      locality('Ceira', 'ceira', COIMBRA, 'l-ceira'),
    ]);

    const result = await service.searchLocalities('', LOCALITY_SEARCH_LIMIT, {
      latitude: FARO.latitude,
      longitude: FARO.longitude,
    });

    expect(result.map((entry) => entry.id)).toEqual(['l-faro', 'l-ceira']);
  });

  it('falls back to the delegation base when no origin is given', async () => {
    const { service, delegationSettings } = makeService(
      [locality('Ceira', 'ceira', COIMBRA, 'l-ceira')],
      { base: { baseLatitude: COIMBRA.latitude, baseLongitude: COIMBRA.longitude } },
    );

    await service.searchLocalities('ceira');

    expect(delegationSettings.get).toHaveBeenCalled();
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
      locality(`Aldeia ${index}`, `aldeia ${index}`, COIMBRA, `id-${index}`),
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
  function makeNearestService() {
    return makeService(
      [
        { ...locality('Faro city', 'faro city', FARO, 'l-faro') },
        locality('Ceira', 'ceira', COIMBRA, 'l-ceira'),
      ],
      { municipalities: [FARO, COIMBRA] },
    );
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
