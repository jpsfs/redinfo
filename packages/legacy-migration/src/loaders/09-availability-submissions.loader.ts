/**
 * `disponibilidade` (8,308 rows — the largest single legacy table this
 * loader touches after `saidas`' children) → `AvailabilitySubmission`.
 *
 * `turno` is used directly as `slot`: legacy already numbers a day's shifts
 * this way, and `AvailabilitySubmission.slot` is deliberately not a foreign
 * key to a materialised shift (see the model comment) — a legacy window's
 * shifts are exactly the "derived, not materialised" case that comment
 * anticipates.
 */
import { Prisma } from '@prisma/client';
import { chunk } from '../chunk';
import { UserResolver } from '../resolvers/user.resolver';
import { RunContext, runInLoaderTransaction } from '../run-context';
import { DisponibilidadeRow } from '../source/row-types';
import { adoptOrCreate, legacyKey, sourceHash } from '../upsert-engine';
import { SynthesisedWindow } from './08-availability-windows.loader';

const ENTITY = 'AvailabilitySubmission';

export async function loadAvailabilitySubmissions(
  ctx: RunContext,
  windows: Map<string, SynthesisedWindow>,
  userResolver: UserResolver,
): Promise<void> {
  const rows = await ctx.source.disponibilidade(ctx.options.since ?? undefined);

  for (const batch of chunk(rows, ctx.options.batchSize)) {
    await runInLoaderTransaction(ctx, async (tx) => {
      for (const row of batch) {
        await loadOneSubmission(ctx, tx, windows, userResolver, row);
      }
    });
  }
}

async function loadOneSubmission(
  ctx: RunContext,
  tx: Prisma.TransactionClient,
  windows: Map<string, SynthesisedWindow>,
  userResolver: UserResolver,
  row: DisponibilidadeRow,
): Promise<void> {
  const key = legacyKey('disponibilidade', row.ano, row.mes, row.dia, row.turno, row.socorrista);
  const window = windows.get(`${row.ano}-${row.mes}`);
  const userId = await userResolver.resolve(row.socorrista);

  if (!window || !userId) {
    ctx.counters.reject(ENTITY);
    ctx.rejects.write(ENTITY, {
      legacyKey: key,
      reasonCode: !window ? 'NO_WINDOW' : 'UNRESOLVED_USER',
      reason: !window
        ? `No synthesised window for ${row.ano}-${row.mes}.`
        : `socorrista ${row.socorrista} does not resolve to a User.`,
      field: !window ? undefined : 'socorrista',
      valueRedacted: !window ? undefined : String(row.socorrista),
    });
    return;
  }

  const date = new Date(Date.UTC(row.ano, row.mes - 1, row.dia));
  const data = { userId, windowId: window.windowId, date, slot: row.turno };
  const hash = sourceHash(data);

  const result = await adoptOrCreate({
    tx,
    entity: ENTITY,
    legacyId: key,
    sourceHash: hash,
    runId: ctx.runId,
    naturalKeyLookup: async () =>
      (
        await tx.availabilitySubmission.findUnique({
          where: { windowId_userId_date_slot: { windowId: window.windowId, userId, date, slot: row.turno } },
        })
      )?.id ?? null,
    create: async () => (await tx.availabilitySubmission.create({ data })).id,
    update: async () => {}, // The composite key is the whole row — nothing else to update.
  });

  ctx.counters.record(ENTITY, result.outcome);
}
