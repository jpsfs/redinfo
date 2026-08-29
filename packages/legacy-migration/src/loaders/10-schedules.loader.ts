/**
 * `escala` (4,812 rows → up to 3 assignments each) → `Schedule` +
 * `ScheduleAssignment`.
 *
 * One `Schedule` per synthesised window (plan §5.3's `escala-schedule:
 * {ano}-{mes}`), `PUBLISHED` with `publishedAt` set to the latest
 * `update_date` seen anywhere in that month — the closest legacy fact to
 * "when this roster was finalised". Each row yields up to three assignments,
 * one per crew slot (`condutor`, `socorrista_1`, `socorrista_3`) — `0` in any
 * of those columns means the seat was empty, matching the `0` = "nobody"
 * convention plan finding F5 established for `saidas`.
 *
 * **Extends the plan's literal `LegacyIdMap.legacyId` for an assignment**
 * (`escala:{mes}|{turno}|{ano}|{dia}`) with the crew-slot name: one `escala`
 * row can produce up to three `ScheduleAssignment` rows, so the key needs a
 * fourth part to stay one-to-one.
 *
 * A `mes` label `lookupMonth` cannot parse rejects the *whole* row — the
 * date cannot be built at all without it (plan §4.12).
 */
import { chunk } from '../chunk';
import { ESCALA_ROLE_NAMES } from '../mapping.config';
import { lookupMonth } from '../transform/enums';
import { UserResolver } from '../resolvers/user.resolver';
import { RunContext, runInLoaderTransaction } from '../run-context';
import { EscalaRow } from '../source/row-types';
import { adoptOrCreate, legacyKey, sourceHash } from '../upsert-engine';
import { SynthesisedWindow } from './08-availability-windows.loader';
import { Prisma, ScheduleStatus } from '@prisma/client';

const SCHEDULE_ENTITY = 'Schedule';
const ASSIGNMENT_ENTITY = 'ScheduleAssignment';

interface CrewSlot {
  slotKey: keyof typeof ESCALA_ROLE_NAMES;
  crewNumber: number;
}

function crewSlots(row: EscalaRow): CrewSlot[] {
  return [
    { slotKey: 'condutor', crewNumber: row.condutor },
    { slotKey: 'socorrista1', crewNumber: row.socorrista_1 },
    { slotKey: 'socorrista3', crewNumber: row.socorrista_3 },
  ];
}

export async function loadSchedules(
  ctx: RunContext,
  windows: Map<string, SynthesisedWindow>,
  userResolver: UserResolver,
): Promise<void> {
  const rows = await ctx.source.escala(ctx.options.since ?? undefined);

  const publishedAtByMonth = new Map<string, string>();
  const validRows: Array<{ row: EscalaRow; month: number }> = [];
  for (const row of rows) {
    const month = lookupMonth(row.mes);
    if (!month) {
      ctx.counters.reject(SCHEDULE_ENTITY);
      ctx.rejects.write(SCHEDULE_ENTITY, {
        legacyKey: legacyKey('escala', row.mes, row.turno, row.ano, row.dia),
        reasonCode: 'UNPARSEABLE_MONTH',
        reason: `escala.mes "${row.mes}" does not match any known month label.`,
        field: 'mes',
        valueRedacted: row.mes,
      });
      continue;
    }
    const monthKey = `${row.ano}-${month}`;
    const current = publishedAtByMonth.get(monthKey);
    if (!current || row.update_date > current) publishedAtByMonth.set(monthKey, row.update_date);
    validRows.push({ row, month });
  }

  const scheduleIdByMonth = new Map<string, string>();
  for (const [monthKey, publishedAt] of publishedAtByMonth) {
    const window = windows.get(monthKey);
    if (!window) continue; // Should not happen — loader 08 builds its month set from this same table.
    scheduleIdByMonth.set(monthKey, await loadOneSchedule(ctx, monthKey, window.windowId, publishedAt));
  }

  for (const batch of chunk(validRows, ctx.options.batchSize)) {
    await runInLoaderTransaction(ctx, async (tx) => {
      for (const { row, month } of batch) {
        const window = windows.get(`${row.ano}-${month}`);
        const scheduleId = scheduleIdByMonth.get(`${row.ano}-${month}`);
        if (!window || !scheduleId) continue;
        await loadAssignmentsForRow(ctx, tx, row, scheduleId, window, userResolver);
      }
    });
  }
}

async function loadOneSchedule(
  ctx: RunContext,
  monthKey: string,
  windowId: string,
  publishedAt: string,
): Promise<string> {
  const key = legacyKey('escala-schedule', monthKey);
  const data = {
    windowId,
    status: ScheduleStatus.PUBLISHED,
    createdById: ctx.importActorId,
    publishedById: ctx.importActorId,
    publishedAt: new Date(publishedAt),
  };
  const hash = sourceHash(data);

  const result = await runInLoaderTransaction(ctx, (tx) =>
    adoptOrCreate({
      tx,
      entity: SCHEDULE_ENTITY,
      legacyId: key,
      sourceHash: hash,
      runId: ctx.runId,
      naturalKeyLookup: async () => (await tx.schedule.findUnique({ where: { windowId } }))?.id ?? null,
      create: async () => (await tx.schedule.create({ data })).id,
      update: async (id) => {
        await tx.schedule.update({ where: { id }, data: { status: data.status, publishedAt: data.publishedAt } });
      },
    }),
  );
  ctx.counters.record(SCHEDULE_ENTITY, result.outcome);
  return result.newId;
}

async function loadAssignmentsForRow(
  ctx: RunContext,
  tx: Prisma.TransactionClient,
  row: EscalaRow,
  scheduleId: string,
  window: SynthesisedWindow,
  userResolver: UserResolver,
): Promise<void> {
  const date = new Date(Date.UTC(row.ano, lookupMonth(row.mes)! - 1, row.dia));

  for (const slot of crewSlots(row)) {
    if (slot.crewNumber === 0) continue; // Empty seat — F5's convention, not a person to resolve.

    const key = legacyKey('escala', row.mes, row.turno, row.ano, row.dia, slot.slotKey);
    const userId = await userResolver.resolve(slot.crewNumber);
    if (!userId) {
      ctx.counters.reject(ASSIGNMENT_ENTITY);
      ctx.rejects.write(ASSIGNMENT_ENTITY, {
        legacyKey: key,
        reasonCode: 'UNRESOLVED_USER',
        reason: `Crew number ${slot.crewNumber} does not resolve to a User.`,
        field: slot.slotKey,
        valueRedacted: String(slot.crewNumber),
      });
      continue;
    }

    const roleId = window.roleIdByName[slot.slotKey] ?? null;
    const data = {
      scheduleId,
      date,
      slot: row.turno,
      userId,
      roleId,
      isOverride: false,
      assignedById: ctx.importActorId,
    };
    const hash = sourceHash(data);

    const result = await adoptOrCreate({
      tx,
      entity: ASSIGNMENT_ENTITY,
      legacyId: key,
      sourceHash: hash,
      runId: ctx.runId,
      naturalKeyLookup: async () =>
        (
          await tx.scheduleAssignment.findUnique({
            where: { scheduleId_date_slot_userId: { scheduleId, date, slot: row.turno, userId } },
          })
        )?.id ?? null,
      create: async () => (await tx.scheduleAssignment.create({ data })).id,
      update: async (id) => {
        await tx.scheduleAssignment.update({ where: { id }, data: { roleId } });
      },
    });

    ctx.counters.record(ASSIGNMENT_ENTITY, result.outcome);
  }
}
