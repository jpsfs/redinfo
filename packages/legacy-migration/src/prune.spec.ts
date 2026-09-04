import { Counters } from './report/counters';
import { PRUNE_ABSOLUTE_FLOOR, PruneSpec, prunePermitted, pruneStaleImports } from './prune';
import { RunContext } from './run-context';
import { RunOptions } from './cli';

const RUN = 'run-2';

/**
 * The slice of a Prisma client the sweep touches, backed by plain arrays.
 * Handed to the context as `sharedTx`, which is what `currentClient` and
 * `runInLoaderTransaction` both resolve to in dry-run mode — so no real
 * database, and no mock of `$transaction`, is needed to exercise any of this.
 */
class FakeDb {
  rows: Array<{ id: string; entity: string; newId: string; lastRunId: string }> = [];
  deletedTargets: string[] = [];

  legacyIdMap = {
    count: async ({ where }: { where: { entity: string } }) =>
      this.rows.filter((row) => row.entity === where.entity).length,
    findMany: async ({ where }: { where: { entity: string; lastRunId: { not: string } } }) =>
      this.rows
        .filter((row) => row.entity === where.entity && row.lastRunId !== where.lastRunId.not)
        .map((row) => ({ id: row.id, newId: row.newId })),
    deleteMany: async ({ where }: { where: { id: { in: string[] } } }) => {
      this.rows = this.rows.filter((row) => !where.id.in.includes(row.id));
      return { count: where.id.in.length };
    },
  };
}

function makeCtx(db: FakeDb, overrides: Partial<RunOptions> = {}): RunContext {
  const options: RunOptions = {
    apply: false,
    batchSize: 2, // Small on purpose: the sweep must survive being chunked.
    only: null,
    since: null,
    createHospitals: false,
    prune: true,
    failOnReject: false,
    outDir: '/tmp/prune-spec',
    runId: RUN,
    verbose: false,
    ...overrides,
  };
  return {
    runId: RUN,
    prisma: db as never,
    source: {} as never,
    options,
    counters: new Counters(),
    rejects: {} as never,
    clock: () => new Date('2026-01-01T00:00:00Z'),
    importActorId: 'actor',
    shadowMap: new Map(),
    sharedTx: db as never,
  };
}

const SPEC: PruneSpec = {
  entity: 'ScheduleAssignment',
  requiredLoaders: ['08-availability-windows', '10-schedules'],
  deleteRows: async (tx, ids) => {
    (tx as unknown as FakeDb).deletedTargets.push(...ids);
  },
};

function seed(db: FakeDb, { fresh, stale }: { fresh: number; stale: number }): void {
  for (let i = 0; i < fresh; i += 1) {
    db.rows.push({ id: `m-fresh-${i}`, entity: SPEC.entity, newId: `t-fresh-${i}`, lastRunId: RUN });
  }
  for (let i = 0; i < stale; i += 1) {
    db.rows.push({ id: `m-stale-${i}`, entity: SPEC.entity, newId: `t-stale-${i}`, lastRunId: 'run-1' });
  }
}

describe('prunePermitted', () => {
  it('allows a small absolute number of retractions however large a share they are', () => {
    expect(prunePermitted({ mapped: PRUNE_ABSOLUTE_FLOOR, stale: PRUNE_ABSOLUTE_FLOOR })).toBeNull();
  });

  it('allows an ordinary run of edits over the floor', () => {
    expect(prunePermitted({ mapped: 5000, stale: 200 })).toBeNull();
  });

  it('refuses when nearly everything went missing at once — the truncated-extract shape', () => {
    const reason = prunePermitted({ mapped: 5000, stale: 4900 });
    expect(reason).toMatch(/incomplete extract/);
    expect(reason).toContain('4900 of 5000');
  });

  it('refuses right above the fraction limit and allows right below it', () => {
    expect(prunePermitted({ mapped: 1000, stale: 201 })).toMatch(/safety limit/);
    expect(prunePermitted({ mapped: 1000, stale: 200 })).toBeNull();
  });
});

describe('pruneStaleImports', () => {
  it('deletes the target rows legacy stopped producing, and their mappings with them', async () => {
    const db = new FakeDb();
    seed(db, { fresh: 10, stale: 3 });
    const ctx = makeCtx(db);

    const [outcome] = await pruneStaleImports(ctx, [SPEC]);

    expect(outcome).toEqual({
      entity: 'ScheduleAssignment',
      mapped: 13,
      stale: 3,
      deleted: 3,
      skippedReason: null,
    });
    expect(db.deletedTargets.sort()).toEqual(['t-stale-0', 't-stale-1', 't-stale-2']);
    expect(db.rows.map((row) => row.id).sort()).toEqual(
      Array.from({ length: 10 }, (_, i) => `m-fresh-${i}`).sort(),
    );
    expect(ctx.counters.get('ScheduleAssignment').deleted).toBe(3);
  });

  it('leaves rows this run did stamp alone', async () => {
    const db = new FakeDb();
    seed(db, { fresh: 4, stale: 0 });

    const [outcome] = await pruneStaleImports(makeCtx(db), [SPEC]);

    expect(outcome.deleted).toBe(0);
    expect(db.deletedTargets).toEqual([]);
    expect(db.rows).toHaveLength(4);
  });

  it('never touches another entity’s mappings', async () => {
    const db = new FakeDb();
    seed(db, { fresh: 1, stale: 1 });
    db.rows.push({ id: 'm-user', entity: 'User', newId: 't-user', lastRunId: 'run-1' });

    await pruneStaleImports(makeCtx(db), [SPEC]);

    expect(db.rows.map((row) => row.id)).toContain('m-user');
    expect(db.deletedTargets).toEqual(['t-stale-0']);
  });

  it('refuses the sweep when the numbers look like a bad extract rather than edits', async () => {
    const db = new FakeDb();
    seed(db, { fresh: 1, stale: 60 });

    const [outcome] = await pruneStaleImports(makeCtx(db), [SPEC]);

    expect(outcome.deleted).toBe(0);
    expect(outcome.stale).toBe(60);
    expect(outcome.skippedReason).toMatch(/incomplete extract/);
    expect(db.deletedTargets).toEqual([]);
  });

  it('skips under --since, where an unstamped mapping only means "not looked at"', async () => {
    const db = new FakeDb();
    seed(db, { fresh: 1, stale: 2 });

    const [outcome] = await pruneStaleImports(makeCtx(db, { since: '2024-01-01' }), [SPEC]);

    expect(outcome.skippedReason).toMatch(/--since 2024-01-01/);
    expect(db.deletedTargets).toEqual([]);
  });

  it('skips when --only left out a loader the entity is derived from', async () => {
    const db = new FakeDb();
    seed(db, { fresh: 1, stale: 2 });

    const [outcome] = await pruneStaleImports(makeCtx(db, { only: ['10-schedules'] }), [SPEC]);

    expect(outcome.skippedReason).toMatch(/08-availability-windows/);
    expect(db.deletedTargets).toEqual([]);
  });

  it('skips everything under --no-prune, and says so per entity', async () => {
    const db = new FakeDb();
    seed(db, { fresh: 1, stale: 2 });

    const [outcome] = await pruneStaleImports(makeCtx(db, { prune: false }), [SPEC]);

    expect(outcome.skippedReason).toMatch(/--no-prune/);
    expect(db.deletedTargets).toEqual([]);
    expect(db.rows).toHaveLength(3);
  });

  it('deletes across more than one batch', async () => {
    const db = new FakeDb();
    seed(db, { fresh: 100, stale: 5 }); // batchSize is 2 — three chunks.

    const [outcome] = await pruneStaleImports(makeCtx(db), [SPEC]);

    expect(outcome.deleted).toBe(5);
    expect(db.deletedTargets).toHaveLength(5);
    expect(db.rows).toHaveLength(100);
  });
});
