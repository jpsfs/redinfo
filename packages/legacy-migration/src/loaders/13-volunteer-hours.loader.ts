/**
 * `horas_voluntariado` (5,712 rows) → `VolunteerHoursEntry`.
 *
 * Always `source: MANUAL` — legacy has no concept of a shift-generated
 * entry — and always `status: APPROVED`: these are historical records
 * nobody is going to review again, not a pending queue to recreate.
 * `proposedMinutes = minutes = TIME_TO_SEC(horas)/60`, matching the legacy
 * `stats` view's own arithmetic (plan finding F5).
 */
import { chunk } from '../chunk';
import { mapVolunteerActivity } from '../transform/enums';
import { timeStringToMinutes } from '../transform/duration';
import { UserResolver } from '../resolvers/user.resolver';
import { RunContext, runInLoaderTransaction } from '../run-context';
import { adoptOrCreate, legacyKey, sourceHash } from '../upsert-engine';
import { VolunteerHoursStatus, VolunteerHoursSource } from '@prisma/client';

const ENTITY = 'VolunteerHoursEntry';

export async function loadVolunteerHours(ctx: RunContext, userResolver: UserResolver): Promise<void> {
  const rows = await ctx.source.horasVoluntariado(ctx.options.since ?? undefined);

  for (const batch of chunk(rows, ctx.options.batchSize)) {
    await runInLoaderTransaction(ctx, async (tx) => {
      for (const row of batch) {
        const key = legacyKey('horas_voluntariado', row.socorrista, row.data, row.hora_inicio);
        const userId = await userResolver.resolve(row.socorrista);
        if (!userId) {
          ctx.counters.reject(ENTITY);
          ctx.rejects.write(ENTITY, {
            legacyKey: key,
            reasonCode: 'UNRESOLVED_USER',
            reason: `socorrista ${row.socorrista} does not resolve to a User.`,
            field: 'socorrista',
            valueRedacted: String(row.socorrista),
          });
          continue;
        }

        const { activityType, description } = mapVolunteerActivity(row.tipo);
        const minutes = timeStringToMinutes(row.horas);
        const data = {
          userId,
          source: VolunteerHoursSource.MANUAL,
          activityType,
          date: new Date(`${row.data}T00:00:00.000Z`),
          description,
          baselineMinutes: null,
          proposedMinutes: minutes,
          minutes,
          flags: [] as string[],
          status: VolunteerHoursStatus.APPROVED,
          approvedById: ctx.importActorId,
          loggedById: ctx.importActorId,
        };
        const hash = sourceHash(data);

        const result = await adoptOrCreate({
          tx,
          entity: ENTITY,
          legacyId: key,
          sourceHash: hash,
          runId: ctx.runId,
          // No natural key: legacy has no id for this row beyond its own PK, which the legacyId already encodes.
          naturalKeyLookup: async () => null,
          create: async () => (await tx.volunteerHoursEntry.create({ data })).id,
          update: async (id) => {
            await tx.volunteerHoursEntry.update({
              where: { id },
              data: { activityType, description, proposedMinutes: minutes, minutes },
            });
          },
        });

        ctx.counters.record(ENTITY, result.outcome);
      }
    });
  }
}
