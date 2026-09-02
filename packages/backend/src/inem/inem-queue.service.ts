import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PgBoss } from 'pg-boss';

export const INEM_RECONCILE_QUEUE = 'inem.reconcile';
export const INEM_KEEPALIVE_SESSION_QUEUE = 'inem.keepalive.session';
export const INEM_KEEPALIVE_SAML_QUEUE = 'inem.keepalive.saml';

/**
 * pg-boss connection dedicated to the INEM integration's scheduled jobs
 * (#214): the reconciler, and the two keep-alive layers documented in
 * `docs/inem-portal-contract.md`. Kept separate from
 * `NotificationQueueService`'s connection — unrelated features, and
 * `boss.schedule` (cron-style scheduling) is new ground here that the
 * notification framework has never needed, so it gets its own small,
 * reviewable surface rather than being bolted onto an existing one.
 *
 * Fails soft with the feature disabled or no `DATABASE_URL`, the same way
 * `NotificationQueueService` does without a Resend key.
 *
 * `InemReconcilerService` is a *separate* provider that calls `work()` from
 * its own `onModuleInit` — and Nest runs every provider's `onModuleInit`
 * within a module concurrently (`Promise.all`, not declaration order; see
 * `@nestjs/core`'s `on-module-init.hook.js`). `boss.start()` +
 * `createQueue`/`schedule` here take several DB round trips, so a `work()`
 * call arriving before that finishes must not silently no-op — it's queued
 * in `pendingWork` and flushed once `this.boss` exists. Losing this race
 * used to mean pg-boss faithfully created a job every minute forever with
 * no handler ever attached to consume it — no crash, no log line, just a
 * permanently inert integration (see the incident this comment replaced).
 */
@Injectable()
export class InemQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InemQueueService.name);
  private boss: PgBoss | null = null;
  private readonly pendingWork: Array<{ queue: string; handler: () => Promise<void> }> = [];

  async onModuleInit(): Promise<void> {
    if (process.env.INEM_ENABLED !== 'true' || !process.env.INEM_USERNAME) {
      this.logger.log('INEM integration disabled — scheduled jobs not started');
      return;
    }
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      this.logger.warn('DATABASE_URL not set — INEM scheduled jobs disabled');
      return;
    }

    const boss = new PgBoss(connectionString);
    boss.on('error', (err) => this.logger.error(`pg-boss error: ${err.message}`));
    await boss.start();

    await boss.createQueue(INEM_RECONCILE_QUEUE);
    await boss.createQueue(INEM_KEEPALIVE_SESSION_QUEUE);
    await boss.createQueue(INEM_KEEPALIVE_SAML_QUEUE);

    // Push desired state, poll reported state — also what picks up a change
    // a coordinator made directly in INEM's own portal.
    await boss.schedule(INEM_RECONCILE_QUEUE, '* * * * *');
    // Layer 1: a cheap, side-effect-free alAuth ping.
    await boss.schedule(INEM_KEEPALIVE_SESSION_QUEUE, '*/5 * * * *');
    // Layer 2: a deliberate samlsessionid roll, comfortably inside its 8h
    // rolling window — see the contract doc for why layer 1 alone never
    // rolls it.
    await boss.schedule(INEM_KEEPALIVE_SAML_QUEUE, '0 */5 * * *');

    this.boss = boss;

    const queued = this.pendingWork.splice(0, this.pendingWork.length);
    for (const { queue, handler } of queued) {
      await this.registerWork(boss, queue, handler);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.boss?.stop({ graceful: true, timeout: 5000 });
  }

  /**
   * Registers the handler for one of this service's three queues. Call once
   * per queue, at startup — safe to call before `onModuleInit` has finished
   * setting up `boss` (see the class comment); the registration is buffered
   * and flushed once it's ready. If the feature is disabled, `boss` never
   * gets set and this stays buffered harmlessly for the process's lifetime.
   */
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
