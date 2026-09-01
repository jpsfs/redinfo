/**
 * The import system actor — everything else's `createdById`/`submittedById`/
 * `approvedById` and so on. Runs first, after preflight, and its result
 * (`ctx.importActorId`) is what every later loader is written against.
 *
 * `isActive: false` + `passwordHash: null` is what makes a `SYSTEM_ADMIN` row
 * safe to create at all: `LOCAL` with a null hash never authenticates, there
 * is no OAuth `providerId`, and `@@index([isActive, role])`-driven listings
 * exclude it — so this row cannot log in and does not appear in an "assign
 * to a coordinator" picker.
 *
 * `roles` (not `role`): `User.role` was replaced by a `roles: UserRole[]`
 * array — see `schema.prisma`'s multi-role migration — so this actor gets a
 * one-element array, same as every other loader touching `User`.
 */
import { AuthProvider } from '@prisma/client';
import { DEFAULT_IMPORT_ACTOR_EMAIL, IMPORT_ACTOR_ROLE } from '../mapping.config';
import { RunContext, runInLoaderTransaction } from '../run-context';
import { adoptOrCreate, sourceHash } from '../upsert-engine';

const ENTITY = 'User';
const LEGACY_ID = 'system';

export async function loadSystemActor(ctx: RunContext): Promise<string> {
  const email = process.env.LEGACY_IMPORT_ACTOR_EMAIL ?? DEFAULT_IMPORT_ACTOR_EMAIL;
  const hash = sourceHash({ email, roles: [IMPORT_ACTOR_ROLE] });

  const result = await runInLoaderTransaction(ctx, (tx) =>
    adoptOrCreate({
      tx,
      entity: ENTITY,
      legacyId: LEGACY_ID,
      sourceHash: hash,
      runId: ctx.runId,
      naturalKeyLookup: async () => (await tx.user.findUnique({ where: { email } }))?.id ?? null,
      create: async () => {
        const created = await tx.user.create({
          data: {
            email,
            firstName: 'Importação',
            lastName: 'Legacy',
            roles: [IMPORT_ACTOR_ROLE],
            provider: AuthProvider.LOCAL,
            passwordHash: null,
            isActive: false,
          },
        });
        return created.id;
      },
      update: async (id) => {
        await tx.user.update({
          where: { id },
          data: { roles: [IMPORT_ACTOR_ROLE], isActive: false, passwordHash: null },
        });
      },
    }),
  );

  ctx.counters.record(ENTITY, result.outcome);
  return result.newId;
}
