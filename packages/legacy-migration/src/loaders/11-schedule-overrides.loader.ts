/**
 * `alteracoes_escala` (34 rows) → not migrated, for now — and that is a real,
 * complete answer this loader can give without anyone's sign-off, unlike the
 * loaders actually gated on an open question.
 *
 * The target, `ScheduleShiftOverride`, holds only `startMinute`/`endMinute` —
 * a correction to a shift's clock times. `alteracoes_escala` holds
 * `funcao`/`acao`/`estado`: a log of who changed what role on what shift and
 * what the outcome was. There is no minutes-shaped fact anywhere in the
 * source row to put there, so writing a `ScheduleShiftOverride` here would
 * mean inventing a start and end time from nothing — not a judgement call
 * worth a Q number, just data the source table does not contain. Every row
 * is counted and listed in the report's "not migrated" section instead.
 */
import { RunContext } from '../run-context';
import { legacyKey } from '../upsert-engine';

const ENTITY = 'ScheduleShiftOverride';

export async function loadScheduleOverrides(ctx: RunContext): Promise<void> {
  const rows = await ctx.source.alteracoesEscala();

  for (const row of rows) {
    ctx.counters.reject(ENTITY);
    ctx.rejects.write(ENTITY, {
      legacyKey: legacyKey('alteracoes_escala', row.time, row.socorrista),
      reasonCode: 'NO_TARGET_SHAPE',
      reason:
        'alteracoes_escala carries funcao/acao/estado; ScheduleShiftOverride holds only ' +
        'startMinute/endMinute. No minutes-shaped fact exists in the source row to migrate.',
    });
  }
}
