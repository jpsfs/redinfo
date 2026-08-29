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

    const wanted: CertificationType[] = [];
    const fromCurso = mapCertification(socorrista.curso_tripulante);
    if (fromCurso) wanted.push(fromCurso);
    if (socorrista.tem_carta === 1) wanted.push(CertificationType.DRIVER);

    for (const type of wanted) {
      await loadOneCertification(ctx, userId, socorrista.numero, type);
    }
  }
}

async function loadOneCertification(
  ctx: RunContext,
  userId: string,
  numero: number,
  type: CertificationType,
): Promise<void> {
  const key = legacyKey('socorrista-cert', numero, type);
  const data = { userId, type, validUntil: null, issuedOn: null, createdById: ctx.importActorId };
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
        await tx.userCertification.update({ where: { id }, data: { validUntil: null, issuedOn: null } });
      },
    }),
  );

  ctx.counters.record(ENTITY, result.outcome);
}
