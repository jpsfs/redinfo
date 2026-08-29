/**
 * Legacy `updated_by`/`created_by` columns store the `usuarios.usuario`
 * username, not `usuarios.id` — so resolving one to a `User.id` means
 * finding the `usuarios` row with that username first, then following
 * `LegacyIdMap` the same way `user.resolver.ts` does for a numeric
 * `socorrista` id. Falls back to the import actor for a username the dump
 * has lost (or one that was never a real account), never a rejection: an
 * unknown "who last touched this row" is not a reason to drop the row.
 */
import { PrismaClient } from '@prisma/client';
import { legacyKey } from '../upsert-engine';
import { UsuariosRow } from '../source/row-types';

export class ActorResolver {
  private readonly usuarioToLegacyId = new Map<string, string>();
  private readonly cache = new Map<string, string>();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly importActorId: string,
  ) {}

  preload(usuarios: readonly UsuariosRow[]): void {
    for (const row of usuarios) this.usuarioToLegacyId.set(row.usuario, row.id);
  }

  async resolve(username: string | null | undefined): Promise<string> {
    if (!username) return this.importActorId;
    const cached = this.cache.get(username);
    if (cached) return cached;

    const legacyUsuariosId = this.usuarioToLegacyId.get(username);
    if (!legacyUsuariosId) {
      this.cache.set(username, this.importActorId);
      return this.importActorId;
    }

    const mapped = await this.prisma.legacyIdMap.findUnique({
      where: { entity_legacyId: { entity: 'User', legacyId: legacyKey('usuarios', legacyUsuariosId) } },
    });
    const resolved = mapped?.newId ?? this.importActorId;
    this.cache.set(username, resolved);
    return resolved;
  }
}
