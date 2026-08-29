/**
 * Resolves a legacy crew id — the numeric value stored in `saidas.condutor`
 * /`.socorrista1`/`.socorrista2`, `escala.condutor`/`.socorrista_1`
 * /`.socorrista_3`, `disponibilidade.socorrista`, and
 * `horas_voluntariado.socorrista` — to a `User.id`.
 *
 * None of those columns reference `socorrista.numero` or `usuarios.id`
 * directly. Plan finding F5 (measured against the legacy `stats` view, and
 * checked again by `preflight.ts`) is that the legacy app itself joined this
 * numeric id to `usuarios.usuario` — so that is the join this resolver makes:
 * numeric id → `usuarios` row whose `usuario` equals it, as a string → that
 * row's `User` via `LegacyIdMap`.
 *
 * `0` is not "user #0" — F5 also found `saidas.socorrista2 <> 0` guarding the
 * legacy `stats` view, i.e. `0` means "no one in this seat".
 */
import { PrismaClient } from '@prisma/client';
import { legacyKey } from '../upsert-engine';
import { UsuariosRow } from '../source/row-types';

export class UserResolver {
  private readonly usuarioToLegacyId = new Map<string, string>();
  private readonly cache = new Map<number, string | null>();

  constructor(private readonly prisma: PrismaClient) {}

  preload(usuarios: readonly UsuariosRow[]): void {
    for (const row of usuarios) this.usuarioToLegacyId.set(row.usuario, row.id);
  }

  async resolve(crewNumber: number): Promise<string | null> {
    if (crewNumber === 0) return null;
    if (this.cache.has(crewNumber)) return this.cache.get(crewNumber)!;

    const legacyUsuariosId = this.usuarioToLegacyId.get(String(crewNumber));
    if (!legacyUsuariosId) {
      this.cache.set(crewNumber, null);
      return null;
    }

    const mapped = await this.prisma.legacyIdMap.findUnique({
      where: { entity_legacyId: { entity: 'User', legacyId: legacyKey('usuarios', legacyUsuariosId) } },
    });
    const resolved = mapped?.newId ?? null;
    this.cache.set(crewNumber, resolved);
    return resolved;
  }
}
