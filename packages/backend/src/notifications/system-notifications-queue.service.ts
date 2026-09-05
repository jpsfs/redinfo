import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PgBoss } from 'pg-boss';

export const SHIFT_REMINDER_SCAN_QUEUE = 'notification.shift-reminder-scan';
export const BIRTHDAY_SCAN_QUEUE = 'notification.birthday-scan';

/**
 * pg-boss connection dedicated to the two system-triggered producers' scan
 * jobs (shift reminders, birthdays) — cron-scheduled scans that each enqueue
 * per-recipient work onto `NotificationQueueService`'s own delivery queue,
 * the same split `InemQueueService` uses for its own scheduled jobs and for
 * the same reason: `boss.schedule` is unrelated ground to the plain
 * enqueue/work pair the delivery queue needs, so it gets its own connection
 * rather than being bolted onto that one.
 *
 * Fails soft with no `DATABASE_URL`, same as every other queue service here.
 */
@Injectable()
export class SystemNotificationsQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SystemNotificationsQueueService.name);
  private boss: PgBoss | null = null;
  private readonly pendingWork: Array<{ queue: string; handler: () => Promise<void> }> = [];

  async onModuleInit(): Promise<void> {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      this.logger.warn('DATABASE_URL not set — shift-reminder/birthday scans disabled');
      return;
    }
    const boss = new PgBoss(connectionString);
    boss.on('error', (err) => this.logger.error(`pg-boss error: ${err.message}`));
    await boss.start();

    await boss.createQueue(SHIFT_REMINDER_SCAN_QUEUE);
    await boss.createQueue(BIRTHDAY_SCAN_QUEUE);

    // Wide enough that a 24h-ahead reminder is never missed between ticks,
    // narrow enough that `reminderSentAt` alone is enough to dedupe.
    await boss.schedule(SHIFT_REMINDER_SCAN_QUEUE, '*/15 * * * *');
    // Once a day is enough — a birthday doesn't move within the day.
    await boss.schedule(BIRTHDAY_SCAN_QUEUE, '0 7 * * *');

    this.boss = boss;

    const queued = this.pendingWork.splice(0, this.pendingWork.length);
    for (const { queue, handler } of queued) {
      await this.registerWork(boss, queue, handler);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.boss?.stop({ graceful: true, timeout: 5000 });
  }

  /** Registers the handler for one of this service's scan queues — safe to call before `onModuleInit` settles (see class comment). */
  async work(queue: string, handler: () => Promise<void>): Promise<void> {
    if (!this.boss) {
      this.pendingWork.push({ queue, handler });
      return;
    }
    await this.registerWork(this.boss, queue, handler);
  }

  private async registerWork(boss: PgBoss, queue: string, handler: () => Promise<void>): Promise<void> {
    await boss.work(queue, async (jobs) => {
      for (const _job of jobs) {
        await handler();
      }
    });
  }
}
