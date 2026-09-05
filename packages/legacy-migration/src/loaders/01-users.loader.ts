/**
 * `usuarios` ⟕ `socorrista` → `User` (74 rows).
 *
 * `usuarios` is the primary source (one row per login account) and
 * `socorrista` the personnel profile, left-joined on `usuarios.usuario` (a
 * numeric login username) `= socorrista.numero` — the same join
 * `resolvers/user.resolver.ts` makes for a crew id found elsewhere,
 * confirmed by plan finding F5. A `usuarios` row with no matching
 * `socorrista` (an admin account with no personnel profile, say) still
 * becomes a `User` — just one with none of the personnel fields filled in.
 *
 * Every imported row is created with role `EMERGENCY_OPERATIONAL`
 * (`DEFAULT_VOLUNTEER_ROLE`) regardless of `usuarios.tipo` — decision 10 of
 * the original brief, not a guess made here — and `report.md` lists every
 * one by name and email so a coordinator can re-role the real admins and
 * team leaders by hand afterward.
 *
 * `n_cvp` → `redCrossNumber`, `n_tripulante` → `volunteerNumber`, `nif` →
 * `nif`: the plan's own proposed reading of these legacy number fields (§10
 * Q11, "minor" — confirm the assignment, not whether to migrate at all).
 * Every other `socorrista` column Q11 asks about (`grupo_ii`, `estado_civil`,
 * `profissao`, `curso`, `num_curso`, `estado`) has no target field and is not
 * migrated.
 *
 * All three are nullable `int` columns in legacy, each with a real `@unique`
 * target column here — and each has rows using the literal integer `0`
 * (never a real number for any of these) alongside true `NULL`, both meaning
 * "none on file". Confirmed against the real dump: `0` is not sentinelled
 * separately from `NULL`, so treated identically to it below — otherwise
 * every row after the first `0` in each column collides on the unique
 * constraint and aborts the whole run before `report.md` can even be
 * written, rather than the soft "flag it and continue" this was meant to be.
 *
 * `nascimento` (→ `birthDate`, nullable) has the same class of issue in its
 * own type: MySQL's zero-date sentinel `'0000-00-00'` alongside true `NULL`,
 * both meaning "no birth date on file" rather than a real one — `new
 * Date('0000-00-00T...')` is simply an invalid `Date`, so this is treated as
 * absent the same way.
 *
 * `socorrista.nome` (falling back to `usuarios.nome`, same preference order
 * `splitPortugueseName` uses) is copied verbatim into `fullName` — the
 * administrative-use field the schema keeps precisely for a legal name that
 * `firstName`/`lastName` cannot losslessly hold — in addition to being split
 * into `firstName`/`lastName` for display. The two are independent uses of
 * the same legacy string, not one derived from the other.
 */
import { AuthProvider } from '@prisma/client';
import { mapBloodType } from '../transform/enums';
import { resolveEmail } from '../transform/email';
import { normaliseWhitespace, splitPortugueseName } from '../transform/name';
import { phoneFromLegacyInt } from '../transform/phone';
import { DEFAULT_VOLUNTEER_ROLE } from '../mapping.config';
import { LocalityResolver } from '../resolvers/locality.resolver';
import { RunContext, runInLoaderTransaction } from '../run-context';
import { SocorristaRow, UsuariosRow } from '../source/row-types';
import { adoptOrCreate, legacyKey, sourceHash } from '../upsert-engine';

const ENTITY = 'User';

export interface UsersLoaderReport {
  placeholderEmails: Array<{ legacyKey: string; email: string; reason: string }>;
  defaultedVolunteerRoles: Array<{ name: string; email: string }>;
}

export async function loadUsers(ctx: RunContext, localityResolver: LocalityResolver): Promise<UsersLoaderReport> {
  const [usuarios, socorristas] = await Promise.all([ctx.source.usuarios(), ctx.source.socorrista()]);
  const socorristaByNumero = new Map<string, SocorristaRow>(socorristas.map((s) => [String(s.numero), s]));
  const seenEmails = new Set<string>();
  const report: UsersLoaderReport = { placeholderEmails: [], defaultedVolunteerRoles: [] };

  for (const usuario of usuarios) {
    const socorrista = socorristaByNumero.get(usuario.usuario) ?? null;
    await loadOneUser(ctx, localityResolver, usuario, socorrista, seenEmails, report);
  }

  return report;
}

async function loadOneUser(
  ctx: RunContext,
  localityResolver: LocalityResolver,
  usuario: UsuariosRow,
  socorrista: SocorristaRow | null,
  seenEmails: Set<string>,
  report: UsersLoaderReport,
): Promise<void> {
  const key = legacyKey('usuarios', usuario.id);
  const emailResolution = resolveEmail(usuario.id, socorrista?.email, seenEmails);
  if (emailResolution.source === 'placeholder') {
    report.placeholderEmails.push({
      legacyKey: key,
      email: emailResolution.email,
      reason: emailResolution.reason ?? 'BLANK',
    });
  }

  const legacyFullName = socorrista?.nome ?? usuario.nome ?? null;
  const { firstName, lastName } = splitPortugueseName(legacyFullName);
  const localityId = socorrista?.freguesia
    ? await localityResolver.resolve(socorrista.freguesia, key)
    : null;

  const data = {
    email: emailResolution.email,
    firstName,
    lastName,
    fullName: legacyFullName ? normaliseWhitespace(legacyFullName) || null : null,
    roles: [DEFAULT_VOLUNTEER_ROLE],
    provider: AuthProvider.LOCAL,
    passwordHash: null,
    isActive: usuario.activo === 1,
    phone: phoneFromLegacyInt(socorrista?.contacto ?? null),
    birthDate:
      socorrista?.nascimento && socorrista.nascimento !== '0000-00-00'
        ? new Date(`${socorrista.nascimento}T00:00:00.000Z`)
        : null,
    addressLine: socorrista?.rua ?? null,
    postalCode: socorrista?.cod_postal ?? null,
    localityId,
    redCrossNumber: socorrista?.n_cvp ? String(socorrista.n_cvp) : null,
    volunteerNumber: socorrista?.n_tripulante ? String(socorrista.n_tripulante) : null,
    nif: socorrista?.nif ? String(socorrista.nif) : null,
    citizenCardNumber: socorrista?.bi != null ? String(socorrista.bi) : null,
    bloodType: mapBloodType(socorrista?.sangue),
    locale: null,
  };

  const hash = sourceHash(data);

  const result = await runInLoaderTransaction(ctx, (tx) =>
    adoptOrCreate({
      tx,
      entity: ENTITY,
      legacyId: key,
      sourceHash: hash,
      runId: ctx.runId,
      naturalKeyLookup: async () => (await tx.user.findUnique({ where: { email: data.email } }))?.id ?? null,
      create: async () => (await tx.user.create({ data })).id,
      update: async (id) => {
        await tx.user.update({ where: { id }, data });
      },
    }),
  );

  ctx.counters.record(ENTITY, result.outcome);
  if (result.outcome === 'created' || result.outcome === 'adopted') {
    report.defaultedVolunteerRoles.push({ name: `${firstName} ${lastName}`, email: data.email });
  }
}
