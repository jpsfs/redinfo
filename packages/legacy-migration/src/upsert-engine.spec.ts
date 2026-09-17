import { Prisma } from '@prisma/client';
import { LegacyIdMapClient, adoptOrCreate, legacyKey, sourceHash } from './upsert-engine';

/**
 * A minimal in-memory stand-in for `prisma.legacyIdMap`, covering exactly the
 * calls `adoptOrCreate` makes. Keeps this spec a `jest`-only unit test with
 * no database, per `packages/backend/CLAUDE.md`'s test-triad split.
 *
 * `create` also enforces `@@unique([entity, newId])`, throwing the same
 * shape of `P2002` the real database would if `adoptOrCreate` ever called it
 * without checking first — a regression guard, since a real Postgres
 * transaction aborts entirely on that error (see `adoptOrCreate`'s own
 * comment), so catching it there is not an option `findFirst` can be skipped
 * in favour of.
 */
function fakeLegacyIdMapClient(): LegacyIdMapClient {
  const rows = new Map<string, { id: string; entity: string; legacyId: string; newId: string; sourceHash: string }>();
  const newIdsTaken = new Set<string>();
  let nextId = 1;

  return {
    legacyIdMap: {
      findUnique: async ({ where }: any) => {
        const key = `${where.entity_legacyId.entity}::${where.entity_legacyId.legacyId}`;
        return rows.get(key) ?? null;
      },
      findFirst: async ({ where }: any) => {
        return [...rows.values()].find((r) => r.entity === where.entity && r.newId === where.newId) ?? null;
      },
      create: async ({ data }: any) => {
        const newIdKey = `${data.entity}::${data.newId}`;
        if (newIdsTaken.has(newIdKey)) {
          throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the fields: (`entity`,`newId`)', {
            code: 'P2002',
            clientVersion: '5.22.0',
            meta: { modelName: 'LegacyIdMap', target: ['entity', 'newId'] },
          });
        }
        const id = `map-${nextId++}`;
        const row = { id, entity: data.entity, legacyId: data.legacyId, newId: data.newId, sourceHash: data.sourceHash };
        rows.set(`${data.entity}::${data.legacyId}`, row);
        newIdsTaken.add(newIdKey);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = [...rows.values()].find((r) => r.id === where.id)!;
        Object.assign(row, data);
        return row;
      },
      delete: async ({ where }: any) => {
        const row = [...rows.values()].find((r) => r.id === where.id)!;
        rows.delete(`${row.entity}::${row.legacyId}`);
        newIdsTaken.delete(`${row.entity}::${row.newId}`);
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

  it('when a second legacy row adopts a target another legacyId already mapped, keeps the first mapping and applies legacy\'s values instead of throwing', async () => {
    // Mirrors the real incident: an `escala` row with mes "9" and one with
    // mes "Setembro" for the same day/turno/crew resolve to the same
    // ScheduleAssignment natural key, but carry different `legacyId`s.
    const tx = fakeLegacyIdMapClient();
    await adoptOrCreate({
      ...baseParams,
      legacyId: 'escala:9|manha|2026|3|condutor',
      tx,
      sourceHash: 'hash-1',
      naturalKeyLookup: async () => null,
      create: async () => 'assignment-1',
      update: async () => {},
    });

    const update = jest.fn();
    const create = jest.fn(() => {
      throw new Error('must not create a second row for the same target');
    });
    const result = await adoptOrCreate({
      ...baseParams,
      legacyId: 'escala:Setembro|manha|2026|3|condutor',
      tx,
      sourceHash: 'hash-2',
      naturalKeyLookup: async () => 'assignment-1',
      create,
      update,
    });

    expect(result).toEqual({ newId: 'assignment-1', outcome: 'duplicate' });
    expect(update).toHaveBeenCalledWith('assignment-1');
    expect(create).not.toHaveBeenCalled();
  });

  it('recovers when the mapped target was deleted directly in the app, instead of crashing every future run', async () => {
    // Mirrors the real incident: a coordinator deleted a ScheduleAssignment
    // outright, leaving its LegacyIdMap row pointing at nothing. update()
    // rejects with the same shape Prisma throws for a real "0 rows matched"
    // UPDATE (P2025) — a client-side check, not a constraint violation, so
    // it must not be treated like create()'s P2002 above.
    const tx = fakeLegacyIdMapClient();
    await adoptOrCreate({
      ...baseParams,
      tx,
      sourceHash: 'hash-1',
      naturalKeyLookup: async () => null,
      create: async () => 'assignment-1',
      update: async () => {},
    });

    const notFound = new Prisma.PrismaClientKnownRequestError('Record to update not found.', {
      code: 'P2025',
      clientVersion: '5.22.0',
      meta: { modelName: 'ScheduleAssignment', cause: 'Record to update not found.' },
    });
    const update = jest
      .fn()
      .mockRejectedValueOnce(notFound)
      .mockResolvedValue(undefined);
    const result = await adoptOrCreate({
      ...baseParams,
      tx,
      sourceHash: 'hash-2',
      naturalKeyLookup: async () => null,
      create: async () => 'assignment-2',
      update,
    });

    // Re-created under a fresh id, not left crashed — and the stale mapping
    // is gone, so a third run against the same legacyId adopts this new row
    // by natural key rather than tripping the same P2025 again.
    expect(result).toEqual({ newId: 'assignment-2', outcome: 'created' });

    const thirdRun = await adoptOrCreate({
      ...baseParams,
      tx,
      sourceHash: 'hash-2',
      naturalKeyLookup: async () => 'assignment-2',
      create: async () => {
        throw new Error('must not create a second row for the same target');
      },
      update: async () => {},
    });
    expect(thirdRun).toEqual({ newId: 'assignment-2', outcome: 'unchanged' });
  });

  it('still lets a genuine non-P2025 update failure abort the run', async () => {
    const tx = fakeLegacyIdMapClient();
    await adoptOrCreate({
      ...baseParams,
      tx,
      sourceHash: 'hash-1',
      naturalKeyLookup: async () => null,
      create: async () => 'row-id',
      update: async () => {},
    });

    const boom = new Error('connection reset');
    await expect(
      adoptOrCreate({
        ...baseParams,
        tx,
        sourceHash: 'hash-2',
        naturalKeyLookup: async () => null,
        create: async () => {
          throw new Error('must not create a duplicate');
        },
        update: async () => {
          throw boom;
        },
      }),
    ).rejects.toThrow(boom);
  });
});
