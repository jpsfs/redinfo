/**
 * Everything a loader needs, threaded through by `main.ts` rather than
 * imported globally — `runId`, the two clients, the parsed options, the
 * report-in-progress, and the dry-run transaction/shadow map.
 *
 * **Deviation from the plan's literal "one transaction per entity" prose,
 * stated here because it matters:** a genuinely separate transaction per
 * loader means a later loader cannot see an earlier one's writes once they
 * are rolled back — so in dry-run mode a foreign key to a "would-be created"
 * row (a certification pointing at a user the same dry run just "created")
 * would fail for real, inside the database, even though nothing is meant to
 * persist. Two regimes instead:
 * - **`--apply`:** each loader (and each chunk of a batched one) opens and
 *   commits its own transaction via `runInLoaderTransaction`, exactly as the
 *   plan describes — a mid-run failure leaves earlier work committed, and a
 *   re-run picks up where it stopped.
 * - **dry run:** `main.ts` opens one transaction for the *entire* pipeline,
 *   stores it as `sharedTx`, and every loader's `runInLoaderTransaction` call
 *   reuses it instead of opening a new one. Real writes happen (so counts and
 *   validation are against real data, per the brief), everything is visible
 *   to every later loader in the same run, and the single transaction is
 *   rolled back once at the end. `shadowMap` becomes unnecessary for
 *   anything already covered by this — it stays as the documented fallback
 *   for a resolver that reads `LegacyIdMap` directly rather than through a
 *   loader's own transaction.
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { RunOptions } from './cli';
import { Counters } from './report/counters';
import { RejectWriter } from './report/reject-writer';
import { LegacySource } from './source/queries';

export interface RunContext {
  runId: string;
  prisma: PrismaClient;
  source: LegacySource;
  options: RunOptions;
  counters: Counters;
  rejects: RejectWriter;
  clock: () => Date;
  /** Resolved by loader 00 before any other loader runs. */
  importActorId: string;
  shadowMap: Map<string, string>;
  /** Set by `main.ts` for the lifetime of a dry run only — see the module doc. */
  sharedTx?: Prisma.TransactionClient;
}

/**
 * The one place a loader asks for a transaction to write in. Apply mode opens
 * a fresh one (or one per chunk, for a batched loader that calls this
 * multiple times); dry-run mode hands back `ctx.sharedTx` every time, so
 * every loader's writes in the same run are visible to every later loader,
 * right up until the single rollback at the very end.
 */
export async function runInLoaderTransaction<T>(
  ctx: RunContext,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  if (!ctx.options.apply) {
    if (!ctx.sharedTx) throw new Error('runInLoaderTransaction: no shared dry-run transaction on the context.');
    return work(ctx.sharedTx);
  }
  return ctx.prisma.$transaction((tx) => work(tx), { timeout: 300_000, maxWait: 10_000 });
}

export interface CreateRunContextParams {
  prisma: PrismaClient;
  source: LegacySource;
  options: RunOptions;
  clock?: () => Date;
}

export function createRunContext(params: CreateRunContextParams): RunContext {
  return {
    runId: params.options.runId,
    prisma: params.prisma,
    source: params.source,
    options: params.options,
    counters: new Counters(),
    rejects: new RejectWriter(params.options.outDir),
    clock: params.clock ?? (() => new Date()),
    importActorId: '',
    shadowMap: new Map<string, string>(),
  };
}

/**
 * The client a *read-only* resolver (one that was not itself handed a `tx`
 * by a loader's own `runInLoaderTransaction` call — `UserResolver`,
 * `ActorResolver`) must query through, for the same reason
 * `runInLoaderTransaction` picks `ctx.sharedTx` over `ctx.prisma` in dry-run
 * mode: a plain `ctx.prisma` query runs on its own connection, and Postgres
 * (READ COMMITTED) never lets one connection see another connection's
 * still-open, uncommitted transaction. In dry-run mode every write this run
 * has made so far — including a `User` an earlier loader "created" this same
 * run — lives only inside `ctx.sharedTx`, so a resolver reading via
 * `ctx.prisma` instead would see none of them and resolve every one of them
 * as missing (this is exactly what happened: `UserResolver` querying
 * `ctx.prisma` directly meant every crew number pointing at a `User` created
 * earlier in the *same* dry run came back `UNRESOLVED_USER`, near-100% of
 * `AvailabilitySubmission`/`ScheduleAssignment`/`VolunteerHoursEntry` against
 * real production data). In apply mode `ctx.sharedTx` is never set, so this
 * is just `ctx.prisma` — identical to before this existed.
 */
export function currentClient(ctx: RunContext): Prisma.TransactionClient | PrismaClient {
  return ctx.sharedTx ?? ctx.prisma;
}

/** Records what a rolled-back `create()` in dry-run mode would have produced. */
export function rememberShadowId(ctx: RunContext, legacyKey: string, id: string): void {
  ctx.shadowMap.set(legacyKey, id);
}

/** `LegacyIdMap` first, the shadow map second — the shadow only ever fills a gap `apply` mode never has. */
export function shadowedId(ctx: RunContext, legacyKey: string): string | undefined {
  return ctx.shadowMap.get(legacyKey);
}
