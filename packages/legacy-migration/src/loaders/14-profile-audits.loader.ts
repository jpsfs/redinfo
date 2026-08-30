/**
 * `socorrista_hist` **and** `usuarios_hist` → `UserProfileAudit` — plan §10
 * Q6, resolved: both tables are in scope, not just `socorrista_hist`.
 * `ambulancias_hist`/`saidas_hist`/`material_saida_hist` stay in the "not
 * migrated" list (`report.md`, `main.ts`) — no audit model exists for
 * vehicles, reports or material-consumption edit history (plan finding F2).
 *
 * Each `*_hist` table is a row-per-change trail: every row is the state as
 * of `update_date`. `transform/audit-diff.ts` does the actual diffing, given
 * every hist row for one person **plus the current live row appended as the
 * final snapshot** — that last comparison is what captures the most recent
 * change, the one with no later `*_hist` row to record it.
 *
 * `updated_by` resolves through `ActorResolver`, falling back to the import
 * actor for a username the dump has lost — never a reason to drop an audit
 * entry. A `*_hist.update_date` that is MySQL's zero-datetime sentinel
 * *is* one, though (see `loadOneAuditEntry`) — `UserProfileAudit.changedAt`
 * is a fact about when a real change happened, and there is nothing else on
 * the row to date it from.
 */
import { mapBloodType } from '../transform/enums';
import { phoneFromLegacyInt } from '../transform/phone';
import { AuditSnapshot, diffAuditSnapshots } from '../transform/audit-diff';
import { SENSITIVE_AUDIT_FIELDS } from '../mapping.config';
import { ActorResolver } from '../resolvers/actor.resolver';
import { UserResolver } from '../resolvers/user.resolver';
import { RunContext, runInLoaderTransaction } from '../run-context';
import { SocorristaHistRow, SocorristaRow, UsuariosHistRow, UsuariosRow } from '../source/row-types';
import { adoptOrCreate, legacyKey, resolveMappedId, sourceHash } from '../upsert-engine';

const ENTITY = 'UserProfileAudit';

function socorristaFields(row: {
  nome: string | null;
  email: string | null;
  contacto: number | null;
  sangue: string | null;
  bi: number | null;
  nascimento: string | null;
  nif: number | null;
  rua: string | null;
  cod_postal: string | null;
  n_cvp: number | null;
  n_tripulante: number | null;
}): Record<string, string | null> {
  return {
    name: row.nome,
    email: row.email,
    phone: phoneFromLegacyInt(row.contacto),
    bloodType: mapBloodType(row.sangue),
    citizenCardNumber: row.bi != null ? String(row.bi) : null,
    birthDate: row.nascimento,
    nif: row.nif != null ? String(row.nif) : null,
    addressLine: row.rua,
    postalCode: row.cod_postal,
    redCrossNumber: row.n_cvp != null ? String(row.n_cvp) : null,
    volunteerNumber: row.n_tripulante != null ? String(row.n_tripulante) : null,
  };
}

function usuariosFields(row: { nome: string | null; activo: number | null; tipo: string | null }): Record<string, string | null> {
  return {
    name: row.nome,
    isActive: row.activo != null ? String(row.activo === 1) : null,
    legacyAccountType: row.tipo,
  };
}

export async function loadProfileAudits(ctx: RunContext, userResolver: UserResolver, actorResolver: ActorResolver): Promise<void> {
  await loadSocorristaAudits(ctx, userResolver, actorResolver);
  await loadUsuariosAudits(ctx, actorResolver);
}

async function loadSocorristaAudits(ctx: RunContext, userResolver: UserResolver, actorResolver: ActorResolver): Promise<void> {
  const [hist, live] = await Promise.all([ctx.source.socorristaHist(), ctx.source.socorrista()]);

  const histByNumero = new Map<number, SocorristaHistRow[]>();
  for (const row of hist) {
    histByNumero.set(row.numero, [...(histByNumero.get(row.numero) ?? []), row]);
  }
  const liveByNumero = new Map<number, SocorristaRow>(live.map((row) => [row.numero, row]));

  for (const [numero, rows] of histByNumero) {
    const userId = await userResolver.resolve(numero);
    if (!userId) continue; // No resolvable User — nothing to attach the audit trail to.

    const sorted = [...rows].sort((a, b) => a.update_date.localeCompare(b.update_date));
    const snapshots: AuditSnapshot[] = sorted.map((row) => ({
      changedAt: row.update_date,
      updatedBy: row.updated_by,
      fields: socorristaFields(row),
    }));
    const currentRow = liveByNumero.get(numero);
    if (currentRow) {
      snapshots.push({ changedAt: currentRow.update_date, updatedBy: currentRow.updated_by, fields: socorristaFields(currentRow) });
    }

    const diffs = diffAuditSnapshots(snapshots, SENSITIVE_AUDIT_FIELDS);
    for (const diff of diffs) {
      await loadOneAuditEntry(ctx, actorResolver, legacyKey('socorrista_hist', numero, diff.changedAt, diff.field), userId, diff);
    }
  }
}

async function loadUsuariosAudits(ctx: RunContext, actorResolver: ActorResolver): Promise<void> {
  const [hist, live] = await Promise.all([ctx.source.usuariosHist(), ctx.source.usuarios()]);

  const histById = new Map<string, UsuariosHistRow[]>();
  for (const row of hist) {
    histById.set(row.id, [...(histById.get(row.id) ?? []), row]);
  }
  const liveById = new Map<string, UsuariosRow>(live.map((row) => [row.id, row]));

  for (const [id, rows] of histById) {
    const userId = await runInLoaderTransaction(ctx, (tx) => resolveMappedId(tx, 'User', legacyKey('usuarios', id)));
    if (!userId) continue;

    const sorted = [...rows].sort((a, b) => a.update_date.localeCompare(b.update_date));
    const snapshots: AuditSnapshot[] = sorted.map((row) => ({
      changedAt: row.update_date,
      updatedBy: row.updated_by,
      fields: usuariosFields(row),
    }));
    const currentRow = liveById.get(id);
    if (currentRow) {
      snapshots.push({ changedAt: currentRow.update_date, updatedBy: currentRow.updated_by, fields: usuariosFields(currentRow) });
    }

    const diffs = diffAuditSnapshots(snapshots, SENSITIVE_AUDIT_FIELDS);
    for (const diff of diffs) {
      await loadOneAuditEntry(ctx, actorResolver, legacyKey('usuarios_hist', id, diff.changedAt, diff.field), userId, diff);
    }
  }
}

async function loadOneAuditEntry(
  ctx: RunContext,
  actorResolver: ActorResolver,
  key: string,
  userId: string,
  diff: { field: string; oldValue: string | null; newValue: string | null; changedAt: string; updatedBy: string | null },
): Promise<void> {
  // MySQL's zero-datetime sentinel — confirmed against the real dump, a
  // handful of `*_hist` rows have it instead of a real `update_date`.
  // `changedAt` is NOT NULL (`@default(now())`), but that default exists for
  // rows the app itself creates going forward, not as a stand-in for a real
  // historical fact this loader simply doesn't have; unlike `submittedAt`
  // (loader 12), there is no other still-known date on the same row to fall
  // back to, and — unlike a `User`/`EventReport` — losing one supplementary
  // audit-trail entry doesn't misrepresent the entity it's attached to, so
  // this is rejected rather than dated with a fabricated "now".
  if (diff.changedAt === '0000-00-00 00:00:00') {
    ctx.counters.reject(ENTITY);
    ctx.rejects.write(ENTITY, {
      legacyKey: key,
      reasonCode: 'INVALID_CHANGED_AT',
      reason: `*_hist.update_date "${diff.changedAt}" is MySQL's zero-datetime sentinel, not a real timestamp.`,
      field: 'update_date',
      valueRedacted: diff.changedAt,
    });
    return;
  }

  const changedById = await actorResolver.resolve(diff.updatedBy);
  const data = {
    userId,
    changedById,
    field: diff.field,
    oldValue: diff.oldValue,
    newValue: diff.newValue,
    changedAt: new Date(diff.changedAt),
  };
  const hash = sourceHash(data);

  const result = await runInLoaderTransaction(ctx, (tx) =>
    adoptOrCreate({
      tx,
      entity: ENTITY,
      legacyId: key,
      sourceHash: hash,
      runId: ctx.runId,
      naturalKeyLookup: async () => null, // Always synthesised — the legacyId already encodes the whole identity.
      create: async () => (await tx.userProfileAudit.create({ data })).id,
      update: async () => {}, // An audit entry is an immutable historical fact once written.
    }),
  );

  ctx.counters.record(ENTITY, result.outcome);
}
