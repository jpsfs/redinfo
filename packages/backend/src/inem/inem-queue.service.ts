import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PgBoss } from 'pg-boss';

export const INEM_RECONCILE_QUEUE = 'inem.reconcile';
export const INEM_KEEPALIVE_SESSION_QUEUE = 'inem.keepalive.session';
export const INEM_KEEPALIVE_SAML_QUEUE = 'inem.keepalive.saml';

/**
 * Bounds for the randomized delay between reconcile passes (see
 * `workReconcile`) — a 20-minute base cadence, jittered ±5 minutes so the
 * requests INEM sees never fall into an exact, bot-like pattern. Gentle on
 * INEM's server by default; a coordinator's save or the "Sync now" button
 * both reach INEM immediately regardless (`InemReconcilerService.triggerNow`),
 * so this bound is about the background loop's idle cadence, not
 * responsiveness. Configurable without a redeploy; see `.env.example`.
 */
const DEFAULT_RECONCILE_MIN_INTERVAL_SECONDS = 15 * 60;
const DEFAULT_RECONCILE_MAX_INTERVAL_SECONDS = 25 * 60;

/**
 * Same idea as the reconcile bounds above, for the `alAuth` keep-alive ping
 * (`InemSessionService.pingStatistics`) — a real round trip to INEM, not a
 * free internal check. Used to be a flat every-5-minutes cron; moved onto
 * the same jittered-chain mechanism as the reconciler on
 * 2026-09-10 to cut INEM's load roughly 3x (a 15-minute base cadence,
 * jittered ±3 minutes) now that the reconcile loop's own 403 handler plus
 * warm re-mint already covers `alAuth` expiry whenever it actually happens
 * (see docs/inem-portal-contract.md's open-questions table) — this ping only
 * needs to catch it *promptly*, not on a tight clock.
 */
const DEFAULT_KEEPALIVE_SESSION_MIN_INTERVAL_SECONDS = 12 * 60;
const DEFAULT_KEEPALIVE_SESSION_MAX_INTERVAL_SECONDS = 18 * 60;

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
 *
 * `INEM_RECONCILE_QUEUE` and `INEM_KEEPALIVE_SESSION_QUEUE` aren't on a cron:
 * each is its own self-perpetuating chain — `workReconcile`/
 * `workKeepaliveSession` reschedule their next pass, at a randomized delay,
 * once the current one finishes (success or failure). See
 * `registerChainWork`'s doc comment. `INEM_KEEPALIVE_SAML_QUEUE` is
 * untouched by this and stays on plain cron — out of scope for the
 * 2026-09-10 load-reduction change that moved the other two off it.
 *
 * Each chain only stays *one* chain because its queue's `'exclusive'` policy
 * (below) makes pg-boss itself refuse a second queued-or-active job for it.
 * Without that, every `onModuleInit` — i.e. every restart or redeploy — adds
 * one more permanent, parallel chain that never merges back: found live in
 * production on 2026-09-10 as 42 concurrent chains hammering INEM's login
 * every ~20-35s instead of the intended 15-25min, after a run of same-day
 * redeploys during this integration's rollout.
 *
 * The same `'exclusive'` policy also means a chain's own successor must not
 * be sent until the current job is actually `complete`d — see
 * `registerChainWork`'s comment for the corollary bug that shipped alongside
 * the fix above and killed the reconcile chain after its very first pass.
 */
@Injectable()
export class InemQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InemQueueService.name);
  private boss: PgBoss | null = null;
  private readonly pendingWork: Array<{ queue: string; handler: () => Promise<void> }> = [];
  private readonly pendingChainHandlers = new Map<string, () => Promise<void>>();

  /** The two self-perpetuating chains, keyed by queue name — see `registerChainWork`. */
  private readonly chainIntervalSeconds: Record<string, { min: () => number; max: () => number }> = {
    [INEM_RECONCILE_QUEUE]: {
      min: () => Number(process.env.INEM_RECONCILE_MIN_INTERVAL_SECONDS) || DEFAULT_RECONCILE_MIN_INTERVAL_SECONDS,
      max: () => Number(process.env.INEM_RECONCILE_MAX_INTERVAL_SECONDS) || DEFAULT_RECONCILE_MAX_INTERVAL_SECONDS,
    },
    [INEM_KEEPALIVE_SESSION_QUEUE]: {
      min: () =>
        Number(process.env.INEM_KEEPALIVE_SESSION_MIN_INTERVAL_SECONDS) ||
        DEFAULT_KEEPALIVE_SESSION_MIN_INTERVAL_SECONDS,
      max: () =>
        Number(process.env.INEM_KEEPALIVE_SESSION_MAX_INTERVAL_SECONDS) ||
        DEFAULT_KEEPALIVE_SESSION_MAX_INTERVAL_SECONDS,
    },
  };

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

    // 'exclusive': pg-boss refuses to insert a second queued-or-active job
    // for a chain's queue (a partial unique index, not app-level logic) —
    // see the class comment on why that guarantee matters for a
    // self-perpetuating chain. Policy is fixed at creation and pg-boss's
    // `updateQueue` won't touch it — a queue an older deploy already created
    // under the default 'standard' policy has to be dropped and recreated to
    // pick up 'exclusive'. Safe: neither chain's job carries state of its own
    // (INEM's session/unit data lives in Postgres, not the job payload), and
    // `onModuleInit` always reseeds exactly one job per chain at the end
    // regardless. Only runs the drop when the policy actually needs to
    // change, so a steady-state restart doesn't discard an in-flight job for
    // nothing.
    await this.ensureExclusiveQueue(boss, INEM_RECONCILE_QUEUE);
    await this.ensureExclusiveQueue(boss, INEM_KEEPALIVE_SESSION_QUEUE);
    await boss.createQueue(INEM_KEEPALIVE_SAML_QUEUE);

    // Self-heals a stale cron row `boss.schedule(...)` left behind in
    // pg-boss's own `schedule` table by an older deploy before each queue
    // became a self-perpetuating chain (see the class comment) — pg-boss
    // persists schedules in Postgres, not in process memory, so simply no
    // longer calling `schedule()` here doesn't remove a row an older deploy
    // already wrote. A leftover cron row would silently run alongside the
    // chain's own jittered cadence instead of it. No-op (a plain DELETE) if
    // the row is already gone.
    await boss.unschedule(INEM_RECONCILE_QUEUE);
    await boss.unschedule(INEM_KEEPALIVE_SESSION_QUEUE);

    // The one layer still on plain cron — a deliberate samlsessionid roll,
    // comfortably inside its 8h rolling window; see the contract doc for why
    // the session keep-alive alone never rolls it.
    await boss.schedule(INEM_KEEPALIVE_SAML_QUEUE, '0 */5 * * *');

    this.boss = boss;

    const queued = this.pendingWork.splice(0, this.pendingWork.length);
    for (const { queue, handler } of queued) {
      await this.registerWork(boss, queue, handler);
    }
    const pendingChains = [...this.pendingChainHandlers];
    this.pendingChainHandlers.clear();
    for (const [queue, handler] of pendingChains) {
      await this.registerChainWork(boss, queue, handler);
    }

    // Seeds each chain's very first link. Safe even if a handler hasn't been
    // registered for it yet — same as any other pg-boss job, this one just
    // sits in the queue table until a worker attaches, it doesn't require
    // one to exist first.
    await this.scheduleChain(boss, INEM_RECONCILE_QUEUE, 0);
    await this.scheduleChain(boss, INEM_KEEPALIVE_SESSION_QUEUE, 0);
  }

  private async ensureExclusiveQueue(boss: PgBoss, queue: string): Promise<void> {
    const existing = await boss.getQueue(queue);
    if (existing && existing.policy !== 'exclusive') {
      await boss.deleteQueue(queue);
    }
    await boss.createQueue(queue, { policy: 'exclusive' });
  }

  async onModuleDestroy(): Promise<void> {
    await this.boss?.stop({ graceful: true, timeout: 5000 });
  }

  /**
   * Registers the handler for the one remaining plain-cron queue
   * (`INEM_KEEPALIVE_SAML_QUEUE`). Safe to call before `onModuleInit` has
   * finished setting up `boss` (see the class comment); the registration is
   * buffered and flushed once it's ready. If the feature is disabled, `boss`
   * never gets set and this stays buffered harmlessly for the process's
   * lifetime.
   *
   * `INEM_RECONCILE_QUEUE` and `INEM_KEEPALIVE_SESSION_QUEUE` use
   * `workReconcile`/`workKeepaliveSession` instead — neither is a plain cron
   * consumer, both drive their own rescheduling.
   */
  async work(queue: string, handler: () => Promise<void>): Promise<void> {
    if (!this.boss) {
      this.pendingWork.push({ queue, handler });
      return;
    }
    await this.registerWork(this.boss, queue, handler);
  }

  /**
   * Registers the reconcile loop's handler — see `registerChainWork` for
   * what "registers" means for a self-perpetuating chain.
   */
  async workReconcile(handler: () => Promise<void>): Promise<void> {
    await this.workChain(INEM_RECONCILE_QUEUE, handler);
  }

  /**
   * Registers the `alAuth` keep-alive ping's handler
   * (`InemSessionService.pingStatistics`) — the same self-perpetuating-chain
   * treatment as `workReconcile`, moved off a flat every-5-minutes cron on
   * 2026-09-10 to cut the load a real INEM round trip puts on their server
   * roughly 3x (see `DEFAULT_KEEPALIVE_SESSION_MIN/MAX_INTERVAL_SECONDS`).
   */
  async workKeepaliveSession(handler: () => Promise<void>): Promise<void> {
    await this.workChain(INEM_KEEPALIVE_SESSION_QUEUE, handler);
  }

  /**
   * Shared by `workReconcile`/`workKeepaliveSession`. Every pass — whether it
   * succeeds or throws — schedules its own successor at a randomized delay
   * (this queue's configured min/max, `chainIntervalSeconds`) once it's done,
   * rather than firing on a fixed cron. Two things that buys: the loop is
   * gentle on INEM's server, and the randomized gap means INEM never sees a
   * metronomic, easily-fingerprinted polling pattern. A coordinator's save
   * (or the UI's "Sync now" button) doesn't wait out the reconcile chain's own
   * delay — `InemReconcilerService.triggerNow()` runs a pass directly,
   * independent of it.
   *
   * Not built on the generic `work()`/`pendingWork` plumbing — see
   * `registerChainWork` for why it needs the job's own id, not just the
   * caller's handler. Same before-`boss`-is-ready buffering as `work()`, just
   * keyed by queue in `pendingChainHandlers` (there's only ever one handler
   * per chain).
   */
  private async workChain(queue: string, handler: () => Promise<void>): Promise<void> {
    if (!this.boss) {
      this.pendingChainHandlers.set(queue, handler);
      return;
    }
    await this.registerChainWork(this.boss, queue, handler);
  }

  /**
   * Completes the just-run job *before* sending its successor — the order
   * matters. Each chain's queue has an `'exclusive'` policy, a partial unique
   * index on `(name, singleton_key) WHERE state <= 'active'`, and pg-boss
   * doesn't move a job out of `active` until the handler it invoked — this
   * one — returns. Sending the next link first (from inside that same
   * still-active handler, the original shape of this method) raced that
   * index: the insert lost to pg-boss's own `ON CONFLICT DO NOTHING` every
   * time, so the chain ran its seeded first pass and then died silently —
   * no thrown error, no log line, nothing to catch a breaker or a test.
   * Found live in production on 2026-09-10, hours after the exclusive-policy
   * fix (fc20de2) shipped: `INEMUnit.lastSyncedAt` frozen at the deploy
   * before it, while the (then plain-cron) keep-alive queues kept ticking and
   * made the integration look healthy from `INEMSession.updatedAt` alone.
   *
   * Completing here first is safe even though pg-boss's own post-handler
   * `complete()` call still runs right after this returns: that call is
   * itself guarded by `WHERE state = 'active'` (`completeJobs` in pg-boss's
   * `plans.js`), so it just affects zero rows the second time — not an
   * error, not a retry.
   */
  private async registerChainWork(boss: PgBoss, queue: string, handler: () => Promise<void>): Promise<void> {
    await boss.work(queue, async (jobs) => {
      for (const job of jobs) {
        try {
          await handler();
        } finally {
          await boss.complete(queue, job.id);
          if (this.boss) await this.scheduleChain(this.boss, queue, this.randomChainDelaySeconds(queue));
        }
      }
    });
  }

  private async scheduleChain(boss: PgBoss, queue: string, startAfterSeconds: number): Promise<void> {
    await boss.send(queue, {}, { startAfter: startAfterSeconds });
  }

  private randomChainDelaySeconds(queue: string): number {
    const { min, max } = this.chainIntervalSeconds[queue];
    return min() + Math.random() * (max() - min());
  }

  private async registerWork(boss: PgBoss, queue: string, handler: () => Promise<void>): Promise<void> {
    await boss.work(queue, async (jobs) => {
      for (const _job of jobs) {
        await handler();
      }
    });
  }
}
