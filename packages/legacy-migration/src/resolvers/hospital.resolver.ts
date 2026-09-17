/**
 * Resolves `(name, municipality name)` to a `Hospital.id`. Every hospital
 * `mapping.config.ts`'s tables name is already seeded (`seed-geography.ts`),
 * so this is read-only unless `--create-hospitals` is passed — the plan
 * expects that flag to end up a no-op for this dataset, and preflight
 * assertion 4 is what catches a seed rename before this resolver would
 * otherwise turn it into a silent reject.
 *
 * Queries (and, with `--create-hospitals`, writes) through `currentClient(ctx)`
 * rather than `ctx.prisma` directly — the latter would, on the write path,
 * be a real, immediately-committed `Hospital.create` even during a dry run:
 * `ctx.prisma` is a connection of its own, entirely outside `ctx.sharedTx`,
 * so it has no rollback to be undone by. See `user.resolver.ts` for the same
 * class of bug on the read side.
 */
import { currentClient, RunContext } from '../run-context';

export class HospitalResolver {
  private readonly cache = new Map<string, string | null>();

  constructor(
    private readonly ctx: RunContext,
    private readonly createIfMissing: boolean,
  ) {}

  async resolve(name: string, municipalityName: string): Promise<string | null> {
    const key = `${name} ${municipalityName}`;
    if (this.cache.has(key)) return this.cache.get(key)!;

    const client = currentClient(this.ctx);
    const municipality = await client.municipality.findFirst({ where: { name: municipalityName } });
    if (!municipality) {
      this.cache.set(key, null);
      return null;
    }

    const existing = await client.facility.findFirst({ where: { name, municipalityId: municipality.id } });
    if (existing) {
      this.cache.set(key, existing.id);
      return existing.id;
    }

    if (!this.createIfMissing) {
      this.cache.set(key, null);
      return null;
    }

    const created = await client.facility.create({
      data: { name, municipalityId: municipality.id, isEmergencyDestination: true },
    });
    this.cache.set(key, created.id);
    return created.id;
  }
}
