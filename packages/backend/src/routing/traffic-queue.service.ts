import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PgBoss } from 'pg-boss';

export const TRAFFIC_SAMPLE_QUEUE = 'traffic.sample';

/**
 * A few thousand vendor calls a quarter (the ticket's own budget), not a
 * continuous loop — plain cron, not the jittered self-perpetuating-chain
 * pattern `InemQueueService` uses for its minutes-scale reconcile loop. 1st
 * of Jan/Apr/Jul/Oct, 03:00 UTC — off-peak, and clear of any date-rollover
 * edge case.
 */
const TRAFFIC_SAMPLE_CRON = '0 3 1 1,4,7,10 *';

/**
 * pg-boss connection for `TrafficCorridorSamplerService`'s quarterly job
 * (#232). Kept separate from `NotificationQueueService`'s and
 * `InemQueueService`'s connections — same reasoning as `InemQueueService`'s
 * own doc comment: unrelated features, small reviewable surface each.
 *
 * Fails soft with no `DATABASE_URL`, same as every other queue service here.
 */
@Injectable()
export class TrafficQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TrafficQueueService.name);
  private boss: PgBoss | null = null;
  private pendingWork: (() => Promise<void>) | null = null;

  async onModuleInit(): Promise<void> {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      this.logger.warn('DATABASE_URL not set — quarterly traffic sampling schedule disabled');
      return;
    }

    const boss = new PgBoss(connectionString);
    boss.on('error', (err) => this.logger.error(`pg-boss error: ${err.message}`));
    await boss.start();
    await boss.createQueue(TRAFFIC_SAMPLE_QUEUE);
    await boss.schedule(TRAFFIC_SAMPLE_QUEUE, TRAFFIC_SAMPLE_CRON);
    this.boss = boss;

    if (this.pendingWork) {
      await this.registerWork(boss, this.pendingWork);
      this.pendingWork = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.boss?.stop({ graceful: true, timeout: 5000 });
  }

  /** Registers the quarterly sampler's handler. Safe to call before `onModuleInit` finishes — buffered the same way `InemQueueService.work` is. */
  async work(handler: () => Promise<void>): Promise<void> {
    if (!this.boss) {
      this.pendingWork = handler;
      return;
    }
    await this.registerWork(this.boss, handler);
  }

  /** A future "resample now" admin action — runs immediately rather than waiting for the next quarter. No-ops if the schedule is disabled. */
  async triggerNow(): Promise<void> {
    if (!this.boss) return;
    await this.boss.send(TRAFFIC_SAMPLE_QUEUE, {});
  }

  private async registerWork(boss: PgBoss, handler: () => Promise<void>): Promise<void> {
    await boss.work(TRAFFIC_SAMPLE_QUEUE, async (jobs) => {
      for (const _job of jobs) await handler();
    });
  }
}
