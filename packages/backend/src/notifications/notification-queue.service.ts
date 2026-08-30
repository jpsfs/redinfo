import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PgBoss } from 'pg-boss';

export const NOTIFICATION_DELIVER_QUEUE = 'notification.deliver';

/**
 * The job payload is deliberately just an id: the `NotificationDelivery` row
 * it points at already carries notice, recipient and channel, and is the
 * single place that record gets read from and written back to.
 */
export interface NotificationDeliverJob {
  deliveryId: string;
}

/**
 * pg-boss running on the app's own Postgres — deliberately not Redis/BullMQ,
 * so shipping this feature doesn't mean standing up a new container. Retries
 * and backoff come from pg-boss itself; this class only owns the connection
 * lifecycle and a typed enqueue/subscribe pair for the one queue this
 * framework currently has.
 *
 * Fails soft with no `DATABASE_URL` (mirrors the channel services): enqueue
 * becomes a no-op rather than throwing, so the rest of the app still boots.
 */
@Injectable()
export class NotificationQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationQueueService.name);
  private boss: PgBoss | null = null;

  async onModuleInit(): Promise<void> {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      this.logger.warn('DATABASE_URL not set — notification queue disabled');
      return;
    }
    const boss = new PgBoss(connectionString);
    boss.on('error', (err) => this.logger.error(`pg-boss error: ${err.message}`));
    await boss.start();
    await boss.createQueue(NOTIFICATION_DELIVER_QUEUE);
    this.boss = boss;
  }

  async onModuleDestroy(): Promise<void> {
    await this.boss?.stop({ graceful: true, timeout: 5000 });
  }

  async enqueue(job: NotificationDeliverJob): Promise<void> {
    if (!this.boss) return;
    await this.boss.send(NOTIFICATION_DELIVER_QUEUE, job, { retryLimit: 3, retryBackoff: true });
  }

  /** Registers the single handler for the delivery queue. Call once, from `NotificationDeliveryService`. */
  async work(handler: (job: NotificationDeliverJob) => Promise<void>): Promise<void> {
    if (!this.boss) return;
    await this.boss.work<NotificationDeliverJob>(NOTIFICATION_DELIVER_QUEUE, async (jobs) => {
      for (const job of jobs) {
        await handler(job.data);
      }
    });
  }
}
