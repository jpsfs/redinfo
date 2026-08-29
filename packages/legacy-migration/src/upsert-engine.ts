/**
 * The one function every loader upserts through, plus its two building
 * blocks (`legacyKey`, `sourceHash`) and the dry-run signal every loader's
 * transaction ends with.
 *
 * Resolution order, and why (see `LegacyIdMap`'s own doc comment for the
 * model this sits on top of):
 * 1. **`LegacyIdMap` lookup.** If a mapping already exists, it is
 *    authoritative — it survives a natural key changing in legacy (someone
 *    fixes a typo in an email) — so the row it points at is updated, never
 *    re-resolved by natural key.
 * 2. **`naturalKeyLookup()` — the *adopt* path.** A first run against a
 *    database that already has an `admin@redcross.local` from `prisma:seed`,
 *    or a vehicle a coordinator entered by hand, must claim that row rather
 *    than fail on a unique constraint.
 * 3. **`create()`.**
 *
 * `LegacyIdMap` is written on every branch, keyed by `(entity, legacyId)`.
 *
 * **`update()` runs on every re-run of an already-mapped row, whether or not
 * `sourceHash` changed.** This is "legacy always wins" as a hard guarantee,
 * not an optimisation: a coordinator's edit made directly in the app between
 * two migration runs must not survive a re-run just because legacy's own
 * data happened not to change in the meantime — the loader has no way to
 * distinguish "legacy is unchanged" from "legacy is unchanged but someone
 * edited the row here since". The hash still decides the *reported* outcome
 * (`unchanged` vs. `updated`) for `report.md`'s overwrite count, which is a
 * labelling question, not a write-skipping one.
 */
import { createHash } from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Thrown by a loader's own transaction body at the very end, in dry-run mode
 * only. Caught by the runner one level up and counted as success; Prisma
 * rolls the transaction back because it never resolved — this is the entire
 * dry-run mechanism (plan §5.2), applied per entity rather than threaded as a
 * flag through every write call.
 */
export class DryRunRollback extends Error {
  constructor() {
    super('Dry run: rolling back a transaction that computed its counts but wrote nothing.');
    this.name = 'DryRunRollback';
  }
}

/**
 * Joins a source table's own primary-key parts into the single string
 * `LegacyIdMap.legacyId` holds, prefixed with the table name for readability
 * in the report and in `psql`. A literal `|` inside a part (a `Descricao` of
 * `"Compressas | Esterilizadas"`, say) is backslash-escaped first, so the
 * join separator is always unambiguous — never build one of these by
 * concatenating parts with `|` at a call site instead of calling this.
 */
export function legacyKey(table: string, ...parts: Array<string | number>): string {
  const escaped = parts.map((part) => String(part).replace(/\\/g, '\\\\').replace(/\|/g, '\\|'));
  return `${table}:${escaped.join('|')}`;
}

/** Deterministic regardless of key insertion order — an object's keys are sorted before hashing. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * SHA-256 (hex) of the normalised source tuple a row was written from.
 * Nothing reads this today beyond the "did this row change" comparison in
 * `adoptOrCreate` itself — it exists so a future "only overwrite rows the
 * app hasn't touched" mode has something to compare against.
 */
export function sourceHash(tuple: unknown): string {
  return createHash('sha256').update(stableStringify(tuple)).digest('hex');
}

export type UpsertOutcome = 'created' | 'adopted' | 'updated' | 'unchanged';

export interface UpsertResult {
  newId: string;
  outcome: UpsertOutcome;
}

/**
 * The subset of `PrismaClient`/`Prisma.TransactionClient` this module
 * actually needs, so `upsert-engine.spec.ts` can pass an in-memory fake
 * instead of a real database.
 */
export type LegacyIdMapClient = Pick<PrismaClient, 'legacyIdMap'>;

export interface AdoptOrCreateParams {
  tx: LegacyIdMapClient | Prisma.TransactionClient;
  entity: string;
  legacyId: string;
  sourceHash: string;
  runId: string;
  /** The *adopt* path — returns an existing row's id, or `null` to fall through to `create`. */
  naturalKeyLookup: () => Promise<string | null>;
  /** Returns the new row's id. */
  create: () => Promise<string>;
  /** Applies legacy's current values onto the row `LegacyIdMap` already points at. */
  update: (existingId: string) => Promise<void>;
}

export async function adoptOrCreate(params: AdoptOrCreateParams): Promise<UpsertResult> {
  const { tx, entity, legacyId, sourceHash: hash, runId } = params;
  const legacyIdMap = (tx as LegacyIdMapClient).legacyIdMap;

  const existing = await legacyIdMap.findUnique({ where: { entity_legacyId: { entity, legacyId } } });

  if (existing) {
    // Always re-applied — see the module doc on why this is not skipped when
    // the hash matches. The hash only decides which label the counters get.
    await params.update(existing.newId);
    const outcome: UpsertOutcome = existing.sourceHash === hash ? 'unchanged' : 'updated';
    await legacyIdMap.update({ where: { id: existing.id }, data: { sourceHash: hash, lastRunId: runId } });
    return { newId: existing.newId, outcome };
  }

  const adoptedId = await params.naturalKeyLookup();
  if (adoptedId) {
    await legacyIdMap.create({
      data: { entity, legacyId, newId: adoptedId, sourceHash: hash, firstRunId: runId, lastRunId: runId },
    });
    return { newId: adoptedId, outcome: 'adopted' };
  }

  const newId = await params.create();
  await legacyIdMap.create({
    data: { entity, legacyId, newId, sourceHash: hash, firstRunId: runId, lastRunId: runId },
  });
  return { newId, outcome: 'created' };
}

/**
 * A plain `LegacyIdMap` read, for a loader that needs another entity's id
 * (already written earlier in the same run) without going through
 * `adoptOrCreate`'s full create/update machinery — e.g. loader 06 resolving
 * the `Vehicle` a `Material` row belongs to.
 */
export async function resolveMappedId(
  tx: LegacyIdMapClient,
  entity: string,
  legacyId: string,
): Promise<string | null> {
  const row = await tx.legacyIdMap.findUnique({ where: { entity_legacyId: { entity, legacyId } } });
  return row?.newId ?? null;
}
