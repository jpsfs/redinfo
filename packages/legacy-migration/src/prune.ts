/**
 * Retracting, in the target, what an operator retracted in legacy.
 *
 * `adoptOrCreate` covers create and update, and "legacy always wins"
 * (`upsert-engine.ts`) makes an edit in legacy beat an edit made in the app.
 * Deletes had no such path, and that is a real hole rather than a theoretical
 * one: clearing `escala.condutor` back to `0` — the everyday way somebody is
 * taken off a shift in the legacy system — simply stops producing that
 * assignment's legacy key, so the `ScheduleAssignment` already written here
 * stayed, showing a person on a shift they had been removed from, with no
 * later run ever touching it again.
 *
 * The signal is `LegacyIdMap.lastRunId`: every key the source still produces
 * is stamped with the current run id on its way through `adoptOrCreate`. So
 * once a loader has read its whole source table, a mapping *not* stamped this
 * run is a fact legacy no longer has. Those target rows are deleted, and the
 * mapping with them — a key that later comes back must be created cleanly
 * rather than adopted onto a corpse.
 *
 * Three guards, because this is the only part of the pipeline that destroys
 * data:
 *
 * - **Only the entities on `PRUNE_SPECS`.** Dropping a `User` or an
 *   `EventReport` because a legacy row went missing is not a trade worth
 *   making — those are the archive. A rota entry is not: it describes who is
 *   expected somewhere, and being wrong about that is worse than losing it.
 * - **Only after a complete pass.** `--since` restricts the source query and
 *   `--only` can skip a feeding loader entirely; under either, "not stamped
 *   this run" means "not looked at", not "gone". Both suppress the sweep, and
 *   say so in `report.md` rather than silently doing nothing.
 * - **Only a plausible number of them** (`prunePermitted`). If `escala` comes
 *   back empty because the dump was truncated or the fetch half-failed, every
 *   mapping looks stale at once. Refusing the sweep and reporting it is the
 *   only safe reading of that shape.
 *
 * Deleting a `ScheduleAssignment` is the same delete
 * `ScheduleAssignmentsService.unassign` performs: any `VolunteerHoursEntry`
 * generated from it is `SetNull`'d, never removed, so an approval already on
 * record survives losing the roster row it came from.
 */
import { Prisma } from '@prisma/client';
import { chunk } from './chunk';
import { loaderIsSelected } from './cli';
import { currentClient, RunContext, runInLoaderTransaction } from './run-context';

/**
 * The share of an entity's mapped rows that may vanish in a single run before
 * the sweep refuses to believe it. Deliberately generous for edits (a busy
 * month reshuffling a rota is nowhere near this) and far below the shape a
 * broken extract makes, which is "almost all of them".
 */
export const MAX_PRUNE_FRACTION = 0.2;

/**
 * Below this many stale rows the fraction check never applies. A young target
 * database with 30 mapped assignments and 8 genuine retractions is over 20%
 * without anything being wrong; a bad extract there is not worth guarding
 * against, because the number of rows at stake is small enough to fix by hand.
 */
export const PRUNE_ABSOLUTE_FLOOR = 25;

/** `null` to go ahead; otherwise the reason the sweep is refusing, fit for `report.md`. */
export function prunePermitted(params: { mapped: number; stale: number; maxFraction?: number }): string | null {
  const maxFraction = params.maxFraction ?? MAX_PRUNE_FRACTION;
  const { mapped, stale } = params;
  if (stale <= PRUNE_ABSOLUTE_FLOOR) return null;
  if (mapped === 0) return null; // Nothing is mapped, so nothing can be stale — arithmetic guard only.
  const fraction = stale / mapped;
  if (fraction <= maxFraction) return null;
  return (
    `${stale} of ${mapped} mapped row(s) — ${(fraction * 100).toFixed(1)}% — are missing from this run's ` +
    `source, over the ${(maxFraction * 100).toFixed(0)}% safety limit. Legacy shedding that much at once ` +
    `reads as an incomplete extract rather than as edits, so nothing was deleted.`
  );
}

export interface PruneSpec {
  entity: string;
  /**
   * Every loader that must have run for "not stamped this run" to mean "gone
   * from legacy" — the loader that writes the entity, plus anything it needs
   * in order to write it at all. Skipping loader 08 leaves loader 10 with no
   * windows and every assignment rejected, which is exactly the false
   * "everything is stale" this list exists to prevent.
   */
  requiredLoaders: string[];
  /**
   * Overrides `MAX_PRUNE_FRACTION` for this entity alone. Present because
   * "how much disappearing at once is suspicious" is a per-table judgement,
   * not a global constant — and because a test needs to exercise the sweep
   * itself without the guard standing in front of it.
   */
  maxFraction?: number;
  deleteRows: (tx: Prisma.TransactionClient, ids: string[]) => Promise<void>;
}

export const PRUNE_SPECS: PruneSpec[] = [
  {
    entity: 'ScheduleAssignment',
    requiredLoaders: ['08-availability-windows', '10-schedules'],
    deleteRows: async (tx, ids) => {
      await tx.scheduleAssignment.deleteMany({ where: { id: { in: ids } } });
    },
  },
  {
    // The same defect wearing different clothes: a `disponibilidade` row an
    // operator removes is a volunteer who withdrew, and leaving it here quietly
    // feeds the autofill a person who is not actually available.
    entity: 'AvailabilitySubmission',
    requiredLoaders: ['08-availability-windows', '09-availability-submissions'],
    deleteRows: async (tx, ids) => {
      await tx.availabilitySubmission.deleteMany({ where: { id: { in: ids } } });
    },
  },
];

export interface PruneOutcome {
  entity: string;
  /** Rows of this entity `LegacyIdMap` knows about, before the sweep. */
  mapped: number;
  /** How many of them this run's source no longer produces. */
  stale: number;
  deleted: number;
  /** Non-null when the sweep declined to run — one of the three guards above. */
  skippedReason: string | null;
}

export async function pruneStaleImports(
  ctx: RunContext,
  specs: PruneSpec[] = PRUNE_SPECS,
): Promise<PruneOutcome[]> {
  if (!ctx.options.prune) {
    return specs.map((spec) => ({
      entity: spec.entity,
      mapped: 0,
      stale: 0,
      deleted: 0,
      skippedReason: '--no-prune was passed: rows legacy has dropped were left in place.',
    }));
  }
  const outcomes: PruneOutcome[] = [];
  for (const spec of specs) outcomes.push(await pruneOneEntity(ctx, spec));
  return outcomes;
}

async function pruneOneEntity(ctx: RunContext, spec: PruneSpec): Promise<PruneOutcome> {
  const base: PruneOutcome = { entity: spec.entity, mapped: 0, stale: 0, deleted: 0, skippedReason: null };

  if (ctx.options.since) {
    return {
      ...base,
      skippedReason:
        `--since ${ctx.options.since} read only part of the source, so an unstamped mapping means ` +
        `"not looked at this run", not "deleted in legacy".`,
    };
  }
  const missing = spec.requiredLoaders.filter((id) => !loaderIsSelected(id, ctx.options.only));
  if (missing.length > 0) {
    return { ...base, skippedReason: `--only skipped ${missing.join(', ')}, which this entity is derived from.` };
  }

  // Read through `currentClient`, never `ctx.prisma`, for the reason
  // `run-context.ts` spells out: in dry-run mode this run's own `lastRunId`
  // stamps live only inside the shared transaction, and a plain client would
  // see every single mapping as stale.
  const client = currentClient(ctx);
  const mapped = await client.legacyIdMap.count({ where: { entity: spec.entity } });
  const stale = await client.legacyIdMap.findMany({
    where: { entity: spec.entity, lastRunId: { not: ctx.runId } },
    select: { id: true, newId: true },
  });

  const refusal = prunePermitted({ mapped, stale: stale.length, maxFraction: spec.maxFraction });
  if (refusal) return { ...base, mapped, stale: stale.length, skippedReason: refusal };

  let deleted = 0;
  for (const batch of chunk(stale, ctx.options.batchSize)) {
    await runInLoaderTransaction(ctx, async (tx) => {
      await spec.deleteRows(
        tx,
        batch.map((row) => row.newId),
      );
      await tx.legacyIdMap.deleteMany({ where: { id: { in: batch.map((row) => row.id) } } });
    });
    deleted += batch.length;
  }
  ctx.counters.deleted(spec.entity, deleted);

  return { ...base, mapped, stale: stale.length, deleted };
}
