/**
 * Per-entity created/adopted/updated/unchanged/rejected/deleted counts — the
 * "overwrite summary" `report.md` leads with, and the numbers
 * `--fail-on-reject` inspects. One instance per run, threaded through every
 * loader via `RunContext`.
 */
import { UpsertOutcome } from '../upsert-engine';

export interface EntityCounts {
  created: number;
  adopted: number;
  updated: number;
  unchanged: number;
  rejected: number;
  /** Rows removed because legacy no longer produces their key — see `prune.ts`. */
  deleted: number;
}

const EMPTY: EntityCounts = { created: 0, adopted: 0, updated: 0, unchanged: 0, rejected: 0, deleted: 0 };

export class Counters {
  private readonly byEntity = new Map<string, EntityCounts>();

  private ensure(entity: string): EntityCounts {
    let counts = this.byEntity.get(entity);
    if (!counts) {
      counts = { ...EMPTY };
      this.byEntity.set(entity, counts);
    }
    return counts;
  }

  /** Records the outcome of one `adoptOrCreate` call. */
  record(entity: string, outcome: UpsertOutcome): void {
    this.ensure(entity)[outcome] += 1;
  }

  /** Records one row that could not be imported at all. */
  reject(entity: string): void {
    this.ensure(entity).rejected += 1;
  }

  /** Records rows the prune sweep removed, in one go rather than one at a time. */
  deleted(entity: string, count: number): void {
    this.ensure(entity).deleted += count;
  }

  get(entity: string): EntityCounts {
    return { ...this.ensure(entity) };
  }

  entities(): string[] {
    return [...this.byEntity.keys()];
  }

  /** The headline number the brief asks for: how many existing rows this run would change. */
  totalUpdated(): number {
    return [...this.byEntity.values()].reduce((sum, c) => sum + c.updated, 0);
  }

  totalRejected(): number {
    return [...this.byEntity.values()].reduce((sum, c) => sum + c.rejected, 0);
  }

  /** The other headline: how many existing rows this run would remove outright. */
  totalDeleted(): number {
    return [...this.byEntity.values()].reduce((sum, c) => sum + c.deleted, 0);
  }
}
