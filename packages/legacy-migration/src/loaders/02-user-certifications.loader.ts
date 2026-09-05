/**
 * `socorrista.curso_tripulante` (→ TAT/TAS) and `.tem_carta` (→ DRIVER) →
 * `UserCertification`. At most two rows per person — `CERTIFICATION_IMPLIES`
 * (shared) already grants SBV from TAT and TAT+SBV from TAS at read time, so
 * a materialised SBV row is never written (plan §4.5).
 *
 * `validUntil`/`issuedOn` are left null: legacy has no expiry for
 * `curso_tripulante`, and `n_carta`/`data_validade_carta` are a driving
 * licence *number* and its own expiry, not a certification date — the model
 * comment on `UserCertification.validUntil` says null "counts as valid",
 * which is the correct reading for data the source system never expired.
 *
 * `n_tripulante` — despite the name, not the person's volunteer number (that
 * is `socorrista.numero`, see `01-users.loader.ts`) — is their TAT/TAS
 * certification number (confirmed against the real dump: Diana Esmeralda
 * Duarte Costa, `numero` 83, `n_tripulante` 33848). It has no dedicated
 * column on `UserCertification`, so it is carried into `notes` on the row
 * `curso_tripulante` produces (never on the separate `DRIVER` row, which has
 * no such number in legacy). `0` is the same "none on file" sentinel used
 * elsewhere on this table, not a real number.
 */
import { CertificationType } from '@prisma/client';
import { mapCertification } from '../transform/enums';
import { UserResolver } from '../resolvers/user.resolver';
import { RunContext, runInLoaderTransaction } from '../run-context';
import { adoptOrCreate, legacyKey, sourceHash } from '../upsert-engine';

const ENTITY = 'UserCertification';

export async function loadUserCertifications(ctx: RunContext, userResolver: UserResolver): Promise<void> {
  const socorristas = await ctx.source.socorrista();

  for (const socorrista of socorristas) {
    const userId = await userResolver.resolve(socorrista.numero);
    if (!userId) continue; // No matching usuarios/User row — nothing to attach a certification to.

    const tatTasNote = socorrista.n_tripulante ? `Nº tripulante (legado): ${socorrista.n_tripulante}` : null;

    const fromCurso = mapCertification(socorrista.curso_tripulante);
    if (fromCurso) await loadOneCertification(ctx, userId, socorrista.numero, fromCurso, tatTasNote);
    if (socorrista.tem_carta === 1) {
      await loadOneCertification(ctx, userId, socorrista.numero, CertificationType.DRIVER, null);
    }
  }
}

async function loadOneCertification(
  ctx: RunContext,
  userId: string,
  numero: number,
  type: CertificationType,
  notes: string | null,
): Promise<void> {
  const key = legacyKey('socorrista-cert', numero, type);
  const data = { userId, type, validUntil: null, issuedOn: null, notes, createdById: ctx.importActorId };
  const hash = sourceHash(data);

  const result = await runInLoaderTransaction(ctx, (tx) =>
    adoptOrCreate({
      tx,
      entity: ENTITY,
      legacyId: key,
      sourceHash: hash,
      runId: ctx.runId,
      naturalKeyLookup: async () =>
        (await tx.userCertification.findUnique({ where: { userId_type: { userId, type } } }))?.id ?? null,
      create: async () => (await tx.userCertification.create({ data })).id,
      update: async (id) => {
        await tx.userCertification.update({ where: { id }, data: { validUntil: null, issuedOn: null, notes } });
      },
    }),
  );

  ctx.counters.record(ENTITY, result.outcome);
}
