import { LegacyIdMapClient, adoptOrCreate, legacyKey, sourceHash } from './upsert-engine';

/**
 * A minimal in-memory stand-in for `prisma.legacyIdMap`, covering exactly the
 * three calls `adoptOrCreate` makes. Keeps this spec a `jest`-only unit test
 * with no database, per `packages/backend/CLAUDE.md`'s test-triad split.
 */
function fakeLegacyIdMapClient(): LegacyIdMapClient {
  const rows = new Map<string, { id: string; entity: string; legacyId: string; newId: string; sourceHash: string }>();
  let nextId = 1;

  return {
    legacyIdMap: {
      findUnique: async ({ where }: any) => {
        const key = `${where.entity_legacyId.entity}::${where.entity_legacyId.legacyId}`;
        return rows.get(key) ?? null;
      },
      create: async ({ data }: any) => {
        const id = `map-${nextId++}`;
        const row = { id, entity: data.entity, legacyId: data.legacyId, newId: data.newId, sourceHash: data.sourceHash };
        rows.set(`${data.entity}::${data.legacyId}`, row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = [...rows.values()].find((r) => r.id === where.id)!;
        Object.assign(row, data);
        return row;
      },
    },
  } as unknown as LegacyIdMapClient;
}

describe('legacyKey', () => {
  it('joins parts in order, prefixed by the table', () => {
    expect(legacyKey('saidas', 1835, 2026)).toBe('saidas:1835|2026');
    expect(legacyKey('Material', 12, 'Luvas M')).toBe('Material:12|Luvas M');
  });

  it('escapes a literal | inside a part so it cannot be mistaken for the separator', () => {
    const key = legacyKey('Material', 12, 'Compressas | Esterilizadas');
    expect(key).toBe('Material:12|Compressas \\| Esterilizadas');

    // Two composite parts were given (12, and the descriptive name) — a naive
    // split on unescaped `|` must still find exactly two segments, not three.
    const segments = key.slice('Material:'.length).split(/(?<!\\)\|/);
    expect(segments).toEqual(['12', 'Compressas \\| Esterilizadas']);
  });
});

describe('sourceHash', () => {
  it('is stable across calls for the same tuple', () => {
    const tuple = { a: 1, b: 'two', c: [1, 2, 3] };
    expect(sourceHash(tuple)).toBe(sourceHash({ ...tuple }));
  });

  it('does not depend on key order', () => {
    expect(sourceHash({ a: 1, b: 2 })).toBe(sourceHash({ b: 2, a: 1 }));
  });

  it('changes when any field does', () => {
    expect(sourceHash({ a: 1 })).not.toBe(sourceHash({ a: 2 }));
  });
});

describe('adoptOrCreate', () => {
  const baseParams = {
    entity: 'User',
    legacyId: 'usuarios:1',
    runId: 'run-1',
  };

  it('creates a new row and records the mapping when nothing matches', async () => {
    const tx = fakeLegacyIdMapClient();
    const result = await adoptOrCreate({
      ...baseParams,
      tx,
      sourceHash: 'hash-1',
      naturalKeyLookup: async () => null,
      create: async () => 'new-id-1',
      update: async () => {},
    });
    expect(result).toEqual({ newId: 'new-id-1', outcome: 'created' });
  });

  it('adopts an existing row found by natural key rather than creating a duplicate', async () => {
    const tx = fakeLegacyIdMapClient();
    const create = jest.fn();
    const result = await adoptOrCreate({
      ...baseParams,
      tx,
      sourceHash: 'hash-1',
      naturalKeyLookup: async () => 'existing-id',
      create,
      update: async () => {},
    });
    expect(result).toEqual({ newId: 'existing-id', outcome: 'adopted' });
    expect(create).not.toHaveBeenCalled();
  });

  it('a second run with the same hash reports unchanged, but still re-applies legacy — "legacy always wins" is not an optimisation', async () => {
    const tx = fakeLegacyIdMapClient();
    await adoptOrCreate({
      ...baseParams,
      tx,
      sourceHash: 'hash-1',
      naturalKeyLookup: async () => null,
      create: async () => 'row-id',
      update: async () => {},
    });

    const update = jest.fn();
    const result = await adoptOrCreate({
      ...baseParams,
      tx,
      sourceHash: 'hash-1',
      naturalKeyLookup: async () => null,
      create: async () => {
        throw new Error('must not be called again');
      },
      update,
    });
    expect(result).toEqual({ newId: 'row-id', outcome: 'unchanged' });
    // Labelled "unchanged" for the report, but the write still happened — an
    // app-made edit to this row between two runs must not survive a re-run.
    expect(update).toHaveBeenCalledWith('row-id');
  });

  it('a second run with a different hash updates the mapped row in place', async () => {
    const tx = fakeLegacyIdMapClient();
    await adoptOrCreate({
      ...baseParams,
      tx,
      sourceHash: 'hash-1',
      naturalKeyLookup: async () => null,
      create: async () => 'row-id',
      update: async () => {},
    });

    const update = jest.fn();
    const result = await adoptOrCreate({
      ...baseParams,
      tx,
      sourceHash: 'hash-2',
      naturalKeyLookup: async () => null,
      create: async () => {
        throw new Error('must not create a duplicate');
      },
      update,
    });
    expect(result).toEqual({ newId: 'row-id', outcome: 'updated' });
    expect(update).toHaveBeenCalledWith('row-id');
  });
});
