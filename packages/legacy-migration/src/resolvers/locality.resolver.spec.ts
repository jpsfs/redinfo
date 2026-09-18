/**
 * Unit coverage for `LocalityResolver.resolve()` — specifically the wiring
 * bug this file fixes: a tier-1 exact/prefix hit must not short-circuit past
 * a same-named merged-freguesia member elsewhere (see the guard's own doc
 * comment). `transform/locality.spec.ts` already covers the pure tiebreak
 * logic in isolation; this covers the impure glue that decides *whether*
 * tier 2.5 is even consulted.
 *
 * No real Postgres: `PrismaClient` is stubbed with just enough of
 * `locality.findMany({ include: { municipality: true } })`'s shape to drive
 * `loadCandidates()`, cast through `unknown` the same way the resolver's own
 * doc comment describes other resolvers doing on the read side.
 */
import { PrismaClient } from '@prisma/client';
import { foldForSearch } from '@redinfo/shared';
import { LocalityResolver } from './locality.resolver';

interface FixtureLocality {
  id: string;
  name: string;
  municipalityName: string;
}

function fakePrisma(localities: FixtureLocality[]): PrismaClient {
  return {
    locality: {
      findMany: async () =>
        localities.map((l) => ({
          id: l.id,
          name: l.name,
          searchName: foldForSearch(l.name),
          municipality: { name: l.municipalityName },
        })),
    },
  } as unknown as PrismaClient;
}

describe('LocalityResolver.resolve', () => {
  it('prefers the Barcelos-delegation merged freguesia over an unrelated same-named standalone one elsewhere', async () => {
    // The real fixture this bug was found against (EMG 164/2026): "Aguiar" is
    // its own standalone freguesia in Viana do Alentejo (a tier-1 EXACT
    // match all by itself) *and* the pre-2013 name folded into Barcelos's
    // "União das Freguesias de Quintiães e Aguiar" — reachable only via the
    // merged-freguesia index, never a literal "aguiar" searchName.
    const prisma = fakePrisma([
      { id: 'viana-aguiar', name: 'Aguiar', municipalityName: 'Viana do Alentejo' },
      { id: 'barcelos-union', name: 'União das Freguesias de Quintiães e Aguiar', municipalityName: 'Barcelos' },
    ]);
    const resolver = new LocalityResolver(prisma, new Map());

    const localityId = await resolver.resolve('Aguiar', 'saidas:164/2026');

    expect(localityId).toBe('barcelos-union');
    expect(resolver.mergedFreguesiaMatches.get(foldForSearch('Aguiar'))).toMatchObject({
      resolvedTo: 'União das Freguesias de Quintiães e Aguiar',
      municipality: 'Barcelos',
      tiebreak: 'home-municipality',
    });
  });

  it('still resolves an outright exact match with no merged-freguesia name clash on the fast path', async () => {
    const prisma = fakePrisma([{ id: 'barcelos', name: 'Barcelos', municipalityName: 'Barcelos' }]);
    const resolver = new LocalityResolver(prisma, new Map());

    const localityId = await resolver.resolve('Barcelos', 'saidas:1/2026');

    expect(localityId).toBe('barcelos');
    expect(resolver.mergedFreguesiaMatches.size).toBe(0);
  });

  it('still reports a genuine, unresolved ambiguity between two standalone same-named localities', async () => {
    const prisma = fakePrisma([
      { id: 'lugar-sintra', name: 'Lugar Comum', municipalityName: 'Sintra' },
      { id: 'lugar-cascais', name: 'Lugar Comum', municipalityName: 'Cascais' },
    ]);
    const resolver = new LocalityResolver(prisma, new Map());

    // Neither municipality is the Barcelos-delegation home or a confirmed
    // neighbour, so tier 2.5 can't safely break the tie either — this must
    // land in `unresolved`, never guess one of the two.
    const localityId = await resolver.resolve('Lugar Comum', 'saidas:2/2026');

    expect(localityId).toBeNull();
    expect(resolver.unresolved.has(foldForSearch('Lugar Comum'))).toBe(true);
  });
});
