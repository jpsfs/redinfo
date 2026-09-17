import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { LIVE_RUN_ABANDON_HOURS, LIVE_RUN_RETENTION_HOURS } from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';

const HOUR_MS = 3600_000;

/** How often the sweep runs. Often enough to be tidy, rarely enough to be dull. */
export const PURGE_INTERVAL_MS = 15 * 60 * 1000;

export interface SweepResult {
  purged: number;
  deleted: number;
  forceClosed: number;
}

/**
 * Destroying identity on time, and tidying up after closed runs.
 *
 * **Correctness does not depend on this timer.** `LiveRunsService.loadRow`
 * purges inline when the row it has just read is past its cutoff, *before*
 * returning it, and `assertCanReadRun` refuses a closed run past the cutoff
 * regardless. A dead scheduler cannot leak identity past 48h through any read
 * path — this is a cleaner, not the guarantee. That split is deliberate: a
 * retention promise that holds only while a cron is healthy is not a retention
 * promise.
 *
 * A plain `unref()`'d interval rather than `@nestjs/schedule`. The dependency
 * would make "what runs on a timer here" greppable, which is worth having once
 * there is a second job; for one job whose correctness is guaranteed elsewhere it
 * is a dependency for a comment. `unref()` so it can never hold the process open
 * — a container that has been told to stop should stop.
 */
@Injectable()
export class IdentityPurgeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IdentityPurgeService.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    // Tests drive `sweep()` directly. A timer firing mid-assertion would delete
    // the rows the assertion is about, which is a flake nobody could reproduce.
    if (process.env.NODE_ENV === 'test') return;

    this.timer = setInterval(() => {
      void this.sweep().catch((cause) => {
        this.logger.error(`Live-run sweep failed: ${(cause as Error).message}`);
      });
    }, PURGE_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * Destroys one run's identity, if it is due.
   *
   * Returns whether it purged, so the caller can re-read rather than serve the
   * row it was holding — the point of the inline purge is that nothing past the
   * cutoff is ever *returned*, not merely that it is eventually deleted.
   */
  async purgeIfDue(
    row: { id: string; identity: Uint8Array | null; closedAt: Date | null },
    now: Date = new Date(),
  ): Promise<boolean> {
    if (!row.identity) return false;
    if (!row.closedAt) return false;
    if (now.getTime() - row.closedAt.getTime() < LIVE_RUN_RETENTION_HOURS * HOUR_MS) {
      return false;
    }

    await this.purge([row.id], now);
    return true;
  }

  /** The one place identity is destroyed, so "gone" always records when. */
  async purge(runIds: string[], now: Date = new Date()): Promise<number> {
    if (runIds.length === 0) return 0;
    const result = await this.prisma.liveRun.updateMany({
      where: { id: { in: runIds }, identity: { not: null } },
      data: { identity: null, identityPurgedAt: now },
    });
    return result.count;
  }

  /**
   * Purge, then delete, then force-close — in that order, and it matters.
   *
   * Purging before deleting means a failure between the two leaves the harmless
   * state: a closed run with no identity, waiting to be deleted next time.
   * Reversing them would mean a failure leaves ciphertext on a row nobody is
   * going to look at again.
   *
   * Force-closing is last, and it *closes* rather than deletes: a run whose
   * phone has been silent for a day may still come back, and closing starts the
   * 48h clock instead of throwing away twenty minutes of an emergency.
   *
   * The whole sweep is one transaction behind `pg_try_advisory_xact_lock`, so
   * scaling to two containers never double-sweeps, and a busy instance simply
   * skips this round rather than queueing behind the other one.
   */
  async sweep(now: Date = new Date()): Promise<SweepResult> {
    const retentionCutoff = new Date(now.getTime() - LIVE_RUN_RETENTION_HOURS * HOUR_MS);
    const abandonCutoff = new Date(now.getTime() - LIVE_RUN_ABANDON_HOURS * HOUR_MS);
    const empty: SweepResult = { purged: 0, deleted: 0, forceClosed: 0 };

    return this.prisma.$transaction(
      async (tx) => {
        const [lock] = await tx.$queryRaw<Array<{ acquired: boolean }>>`
          SELECT pg_try_advisory_xact_lock(hashtext('live-run-sweep')::bigint) AS acquired
        `;
        if (!lock?.acquired) return empty;

        // Identity outlives its run by nothing: either the report it became has
        // been filed, or the retention window has closed.
        const due = await tx.liveRun.findMany({
          where: {
            identity: { not: null },
            OR: [
              { closedAt: { lt: retentionCutoff } },
              { report: { submittedAt: { not: null } } },
            ],
          },
          select: { id: true },
        });
        const purged =
          due.length === 0
            ? 0
            : (
                await tx.liveRun.updateMany({
                  where: { id: { in: due.map((row) => row.id) } },
                  data: { identity: null, identityPurgedAt: now },
                })
              ).count;

        const deleted = (
          await tx.liveRun.deleteMany({ where: { closedAt: { lt: retentionCutoff } } })
        ).count;

        const forceClosed = (
          await tx.liveRun.updateMany({
            where: { closedAt: null, updatedAt: { lt: abandonCutoff } },
            data: { state: 'CLOSED' as never, closedAt: now },
          })
        ).count;

        return { purged, deleted, forceClosed };
      },
      { timeout: 30_000 },
    );
  }

  /**
   * Identity destroyed the instant the report is filed, inside the filing's own
   * transaction.
   *
   * Exposed here so the rule lives with the rest of the retention logic, but
   * called from the submit path rather than waited for: "purged when filed" has
   * to be atomic with the filing, or there is a window in which a filed report
   * and a live victim name coexist.
   */
  static purgeForReport(
    tx: Prisma.TransactionClient,
    reportId: string,
    now: Date = new Date(),
  ): Promise<{ count: number }> {
    return tx.liveRun.updateMany({
      where: { reportId, identity: { not: null } },
      data: { identity: null, identityPurgedAt: now },
    });
  }
}
