/**
 * Synthesised `AvailabilityWindow` + `AvailabilityWindowRole`, one per
 * `(ano, mes)` pair that either `escala` or `disponibilidade` mentions.
 *
 * Legacy has no window concept at all (`abertura_disponibilidade` is 0 rows
 * — plan finding F3), yet `Schedule.windowId` and `AvailabilitySubmission
 * .windowId` are both required. Confirmed by the delegation this session:
 * invent one `CLOSED`, `EMERGENCY`-category window per month, owned by the
 * import actor, with no `AvailabilityWindowShift` rows — the schema already
 * supports a window with shifts derived rather than materialised
 * (`ScheduleAssignment`'s own doc comment says as much), which is exactly
 * what a legacy month needs.
 *
 * Three roles per window, not one per legacy `funcao` row: the `escala`
 * crew columns are fixed *positions*, not `funcao` codes — see
 * `mapping.config.ts::ESCALA_ROLE_NAMES`.
 */
import { AvailabilityWindowStatus } from '@prisma/client';
import { lookupMonth } from '../transform/enums';
import { ESCALA_ROLE_NAMES, SYNTHETIC_ROLE_DEFAULTS, SYNTHETIC_WINDOW_CATEGORY } from '../mapping.config';
import { RunContext, runInLoaderTransaction } from '../run-context';
import { adoptOrCreate, legacyKey, sourceHash } from '../upsert-engine';

const WINDOW_ENTITY = 'AvailabilityWindow';
const ROLE_ENTITY = 'AvailabilityWindowRole';

export interface SynthesisedWindow {
  windowId: string;
  roleIdByName: Record<string, string>;
}

/**
 * The plausible range for a legacy `ano`. Anything outside it — most often
 * `0` from a NULL numeric column the driver coerced away — is not a year
 * this association ever operated in, so it must not become a window.
 *
 * Without this check, `monthBounds`'s `Date.UTC(0, ...)` hits JS's two-digit
 * year rule (0 → 1900) and, for `mes: 1`, "day 0 of the following month"
 * rolls back to 1899-12-31 — a real `CLOSED` window silently created with a
 * 19th-century date that then wins "most recently opened" tie-breaks against
 * legitimate windows (this shipped once: a stray `ano` of `0` surfaced on
 * `MyAvailabilityPage` as "today's" window).
 */
const MIN_LEGACY_YEAR = 2000;
const MAX_LEGACY_YEAR = new Date().getUTCFullYear();

/** `ano`/`mes` sane enough to build a real calendar month out of. */
export function isPlausibleLegacyMonth(ano: number, mes: number): boolean {
  return (
    Number.isInteger(ano) &&
    ano >= MIN_LEGACY_YEAR &&
    ano <= MAX_LEGACY_YEAR &&
    Number.isInteger(mes) &&
    mes >= 1 &&
    mes <= 12
  );
}

/** Rejects one source row instead of letting it synthesise a bogus window. */
function rejectImplausibleMonth(ctx: RunContext, legacyId: string, ano: number, mes: number, anoField: string): void {
  const badYear = !Number.isInteger(ano) || ano < MIN_LEGACY_YEAR || ano > MAX_LEGACY_YEAR;
  ctx.counters.reject(WINDOW_ENTITY);
  ctx.rejects.write(WINDOW_ENTITY, {
    legacyKey: legacyId,
    reasonCode: badYear ? 'IMPLAUSIBLE_YEAR' : 'INVALID_MONTH',
    reason: badYear
      ? `${anoField} "${ano}" is not a plausible year (expected ${MIN_LEGACY_YEAR}–${MAX_LEGACY_YEAR}); no window was synthesised for it.`
      : `${anoField.replace('.ano', '.mes')} "${mes}" is not a valid calendar month (1–12); no window was synthesised for it.`,
    field: badYear ? 'ano' : 'mes',
    valueRedacted: badYear ? String(ano) : String(mes),
  });
}

/** `${ano}-${mes}` (mes 1-12) → the window and its three roles. */
export async function loadAvailabilityWindows(ctx: RunContext): Promise<Map<string, SynthesisedWindow>> {
  const [escala, disponibilidade] = await Promise.all([ctx.source.escala(), ctx.source.disponibilidade()]);

  const months = new Set<string>();
  for (const row of escala) {
    const month = lookupMonth(row.mes);
    if (!month) continue; // An unparseable label rejects the *escala* row itself in loader 10, not here.
    if (!isPlausibleLegacyMonth(row.ano, month)) {
      rejectImplausibleMonth(
        ctx,
        legacyKey('escala', row.mes, row.turno, row.ano, row.dia),
        row.ano,
        month,
        'escala.ano',
      );
      continue;
    }
    months.add(`${row.ano}-${month}`);
  }
  for (const row of disponibilidade) {
    if (!isPlausibleLegacyMonth(row.ano, row.mes)) {
      rejectImplausibleMonth(
        ctx,
        legacyKey('disponibilidade', row.ano, row.mes, row.dia, row.turno, row.socorrista),
        row.ano,
        row.mes,
        'disponibilidade.ano',
      );
      continue;
    }
    months.add(`${row.ano}-${row.mes}`);
  }

  const result = new Map<string, SynthesisedWindow>();
  for (const key of months) {
    const [anoStr, mesStr] = key.split('-');
    result.set(key, await loadOneWindow(ctx, Number(anoStr), Number(mesStr)));
  }
  return result;
}

function monthBounds(ano: number, mes: number): { startDate: Date; endDate: Date } {
  return {
    startDate: new Date(Date.UTC(ano, mes - 1, 1)),
    // Day 0 of the following month is the last day of this one.
    endDate: new Date(Date.UTC(ano, mes, 0)),
  };
}

const MONTH_NAMES_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

async function loadOneWindow(ctx: RunContext, ano: number, mes: number): Promise<SynthesisedWindow> {
  const key = legacyKey('escala-window', ano, mes);
  const { startDate, endDate } = monthBounds(ano, mes);
  const data = {
    startDate,
    endDate,
    category: SYNTHETIC_WINDOW_CATEGORY,
    name: `Escala ${MONTH_NAMES_PT[mes - 1]} ${ano} (importada)`,
    status: AvailabilityWindowStatus.CLOSED,
    openedById: ctx.importActorId,
    closedById: ctx.importActorId,
    closedAt: endDate,
  };
  const hash = sourceHash(data);

  const result = await runInLoaderTransaction(ctx, (tx) =>
    adoptOrCreate({
      tx,
      entity: WINDOW_ENTITY,
      legacyId: key,
      sourceHash: hash,
      runId: ctx.runId,
      naturalKeyLookup: async () => null, // Always synthesised — never adopts a pre-existing window.
      create: async () => (await tx.availabilityWindow.create({ data })).id,
      update: async (id) => {
        await tx.availabilityWindow.update({ where: { id }, data });
      },
    }),
  );
  ctx.counters.record(WINDOW_ENTITY, result.outcome);

  const roleIdByName: Record<string, string> = {};
  for (const [slot, name] of Object.entries(ESCALA_ROLE_NAMES)) {
    roleIdByName[slot] = await loadOneRole(ctx, result.newId, name, Object.keys(ESCALA_ROLE_NAMES).indexOf(slot));
  }

  return { windowId: result.newId, roleIdByName };
}

async function loadOneRole(ctx: RunContext, windowId: string, name: string, order: number): Promise<string> {
  const key = legacyKey('escala-window-role', windowId, name);
  const data = { windowId, name, order, ...SYNTHETIC_ROLE_DEFAULTS };
  const hash = sourceHash(data);

  const result = await runInLoaderTransaction(ctx, (tx) =>
    adoptOrCreate({
      tx,
      entity: ROLE_ENTITY,
      legacyId: key,
      sourceHash: hash,
      runId: ctx.runId,
      naturalKeyLookup: async () =>
        (await tx.availabilityWindowRole.findUnique({ where: { windowId_name: { windowId, name } } }))?.id ?? null,
      create: async () => (await tx.availabilityWindowRole.create({ data })).id,
      update: async (id) => {
        await tx.availabilityWindowRole.update({ where: { id }, data });
      },
    }),
  );
  ctx.counters.record(ROLE_ENTITY, result.outcome);
  return result.newId;
}
