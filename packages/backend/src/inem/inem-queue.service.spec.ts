import {
  INEM_KEEPALIVE_SAML_QUEUE,
  INEM_KEEPALIVE_SESSION_QUEUE,
  INEM_RECONCILE_QUEUE,
  InemQueueService,
} from './inem-queue.service';

const bossInstance = {
  on: jest.fn(),
  start: jest.fn().mockResolvedValue(undefined),
  stop: jest.fn().mockResolvedValue(undefined),
  createQueue: jest.fn().mockResolvedValue(undefined),
  getQueue: jest.fn().mockResolvedValue(null),
  deleteQueue: jest.fn().mockResolvedValue(undefined),
  schedule: jest.fn().mockResolvedValue(undefined),
  unschedule: jest.fn().mockResolvedValue(undefined),
  send: jest.fn().mockResolvedValue('job-1'),
  work: jest.fn().mockResolvedValue('worker-1'),
  complete: jest.fn().mockResolvedValue(undefined),
};
const PgBossMock = jest.fn().mockImplementation(() => bossInstance);

// Same reasoning as notification-queue.service.spec.ts's own mock: a getter,
// not a direct property, since the factory runs eagerly during `import`.
jest.mock('pg-boss', () => ({
  get PgBoss() {
    return PgBossMock;
  },
}));

describe('InemQueueService', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...ORIGINAL_ENV,
      DATABASE_URL: 'postgresql://test/db',
      INEM_ENABLED: 'true',
      INEM_USERNAME: 'cvcampo1',
    };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('starts pg-boss, creates all three queues, crons the two keep-alives and seeds the reconcile chain', async () => {
    const service = new InemQueueService();
    await service.onModuleInit();

    expect(PgBossMock).toHaveBeenCalledWith('postgresql://test/db');
    expect(bossInstance.start).toHaveBeenCalled();
    expect(bossInstance.createQueue).toHaveBeenCalledWith(INEM_RECONCILE_QUEUE, { policy: 'exclusive' });
    expect(bossInstance.createQueue).toHaveBeenCalledWith(INEM_KEEPALIVE_SESSION_QUEUE);
    expect(bossInstance.createQueue).toHaveBeenCalledWith(INEM_KEEPALIVE_SAML_QUEUE);
    // A brand-new queue (no existing row) never needs the drop-and-recreate
    // migration below.
    expect(bossInstance.deleteQueue).not.toHaveBeenCalled();
    expect(bossInstance.schedule).toHaveBeenCalledWith(INEM_KEEPALIVE_SESSION_QUEUE, '*/5 * * * *');
    expect(bossInstance.schedule).toHaveBeenCalledWith(INEM_KEEPALIVE_SAML_QUEUE, '0 */5 * * *');
    // Not a cron — seeds the self-rescheduling chain's first link, right away.
    expect(bossInstance.schedule).not.toHaveBeenCalledWith(INEM_RECONCILE_QUEUE, expect.anything());
    expect(bossInstance.send).toHaveBeenCalledWith(INEM_RECONCILE_QUEUE, {}, { startAfter: 0 });
    // Self-heals a leftover cron row an older deploy may have left behind in
    // pg-boss's own `schedule` table — a stale minute-cron would silently
    // double the reconcile frequency underneath the jittered chain above.
    expect(bossInstance.unschedule).toHaveBeenCalledWith(INEM_RECONCILE_QUEUE);
  });

  it('drops and recreates the reconcile queue when an older deploy created it without the exclusive policy', async () => {
    // Found live in production on 2026-09-10: a queue created under the
    // default 'standard' policy let every restart add one more permanent,
    // parallel self-rescheduling chain — 42 of them concurrently, none ever
    // merging back into one. `updateQueue` can't flip `policy` after the
    // fact, so migrating a pre-existing queue means drop-then-recreate.
    bossInstance.getQueue.mockResolvedValueOnce({ name: INEM_RECONCILE_QUEUE, policy: 'standard' });
    const service = new InemQueueService();
    await service.onModuleInit();

    expect(bossInstance.deleteQueue).toHaveBeenCalledWith(INEM_RECONCILE_QUEUE);
    expect(bossInstance.createQueue).toHaveBeenCalledWith(INEM_RECONCILE_QUEUE, { policy: 'exclusive' });
    // The drop wipes any stray duplicate jobs too — onModuleInit's own seed
    // at the end is what guarantees exactly one survives.
    expect(bossInstance.send).toHaveBeenCalledWith(INEM_RECONCILE_QUEUE, {}, { startAfter: 0 });
  });

  it('leaves an already-exclusive reconcile queue alone', async () => {
    bossInstance.getQueue.mockResolvedValueOnce({ name: INEM_RECONCILE_QUEUE, policy: 'exclusive' });
    const service = new InemQueueService();
    await service.onModuleInit();

    expect(bossInstance.deleteQueue).not.toHaveBeenCalled();
  });

  it('registers a handler immediately when boss is already started', async () => {
    const service = new InemQueueService();
    await service.onModuleInit();
    const handler = jest.fn().mockResolvedValue(undefined);

    await service.work(INEM_RECONCILE_QUEUE, handler);

    expect(bossInstance.work).toHaveBeenCalledWith(INEM_RECONCILE_QUEUE, expect.any(Function));
  });

  /**
   * Regression test for the bug this file's class comment documents: Nest
   * runs every provider's `onModuleInit` in a module concurrently
   * (`Promise.all`), not in declaration order — see
   * `@nestjs/core`'s `on-module-init.hook.js`. `InemReconcilerService` is a
   * separate provider that calls `work()` from its own `onModuleInit`, so a
   * call arriving before this service's own `onModuleInit` has finished
   * `boss.start()`/`createQueue`/`schedule` must not be silently dropped —
   * production hit exactly this: pg-boss faithfully created a reconcile job
   * every minute forever with no handler ever attached to consume it.
   */
  it('buffers a work() call that arrives before onModuleInit finishes, and flushes it once boss is ready', async () => {
    const service = new InemQueueService();
    const handler = jest.fn().mockResolvedValue(undefined);

    // Call work() first, exactly like a losing race would — before
    // onModuleInit (and therefore `this.boss`) exists.
    const workCall = service.work(INEM_RECONCILE_QUEUE, handler);
    expect(bossInstance.work).not.toHaveBeenCalled();

    await service.onModuleInit();
    await workCall;

    expect(bossInstance.work).toHaveBeenCalledWith(INEM_RECONCILE_QUEUE, expect.any(Function));
  });

  describe('workReconcile', () => {
    it('registers its handler under INEM_RECONCILE_QUEUE', async () => {
      const service = new InemQueueService();
      await service.onModuleInit();

      await service.workReconcile(jest.fn().mockResolvedValue(undefined));

      expect(bossInstance.work).toHaveBeenCalledWith(INEM_RECONCILE_QUEUE, expect.any(Function));
    });

    it('schedules the next pass within the configured bounds once a pass resolves', async () => {
      const service = new InemQueueService();
      await service.onModuleInit();
      await service.workReconcile(jest.fn().mockResolvedValue(undefined));
      const registered = bossInstance.work.mock.calls[0][1] as (jobs: unknown[]) => Promise<void>;

      bossInstance.send.mockClear(); // drop the startAfter:0 seed call from onModuleInit
      await registered([{ id: 'job-1' }]);

      expect(bossInstance.send).toHaveBeenCalledTimes(1);
      const [queue, data, options] = bossInstance.send.mock.calls[0];
      expect(queue).toBe(INEM_RECONCILE_QUEUE);
      expect(data).toEqual({});
      expect(options.startAfter).toBeGreaterThanOrEqual(15 * 60);
      expect(options.startAfter).toBeLessThanOrEqual(25 * 60);
    });

    it('still schedules the next pass when the handler throws — one bad pass must not stall the loop', async () => {
      const service = new InemQueueService();
      await service.onModuleInit();
      const failingHandler = jest.fn().mockRejectedValue(new Error('boom'));
      await service.workReconcile(failingHandler);
      const registered = bossInstance.work.mock.calls[0][1] as (jobs: unknown[]) => Promise<void>;

      bossInstance.send.mockClear();
      // Same as pg-boss's own contract for a `work()` handler — a rejection
      // propagates so pg-boss can mark the job failed; the rescheduling in
      // this wrapper's `finally` still has to run regardless.
      await expect(registered([{ id: 'job-1' }])).rejects.toThrow('boom');

      expect(failingHandler).toHaveBeenCalled();
      expect(bossInstance.send).toHaveBeenCalledWith(INEM_RECONCILE_QUEUE, {}, expect.objectContaining({ startAfter: expect.any(Number) }));
    });

    it('honors INEM_RECONCILE_MIN/MAX_INTERVAL_SECONDS overrides', async () => {
      process.env.INEM_RECONCILE_MIN_INTERVAL_SECONDS = '10';
      process.env.INEM_RECONCILE_MAX_INTERVAL_SECONDS = '20';
      const service = new InemQueueService();
      await service.onModuleInit();
      await service.workReconcile(jest.fn().mockResolvedValue(undefined));
      const registered = bossInstance.work.mock.calls[0][1] as (jobs: unknown[]) => Promise<void>;

      bossInstance.send.mockClear();
      await registered([{ id: 'job-1' }]);

      const [, , options] = bossInstance.send.mock.calls[0];
      expect(options.startAfter).toBeGreaterThanOrEqual(10);
      expect(options.startAfter).toBeLessThanOrEqual(20);
    });

    /**
     * Regression test for the bug found live in production on 2026-09-10:
     * `INEM_RECONCILE_QUEUE`'s `'exclusive'` policy refuses a second
     * queued-or-active job under its name, and pg-boss doesn't move a job
     * out of `active` until the handler it invoked returns. Sending the
     * successor before completing the current job (the original shape of
     * this method) raced that index and always lost — the chain ran its
     * seeded first pass and then died silently forever. Complete must run,
     * and must resolve, before send is even called.
     */
    it('completes the current job before sending its successor, not after', async () => {
      const service = new InemQueueService();
      await service.onModuleInit();
      await service.workReconcile(jest.fn().mockResolvedValue(undefined));
      const registered = bossInstance.work.mock.calls[0][1] as (jobs: unknown[]) => Promise<void>;

      bossInstance.send.mockClear();
      const callOrder: string[] = [];
      bossInstance.complete.mockImplementationOnce(async () => {
        callOrder.push('complete');
      });
      bossInstance.send.mockImplementationOnce(async () => {
        callOrder.push('send');
        return 'job-2';
      });

      await registered([{ id: 'job-1' }]);

      expect(bossInstance.complete).toHaveBeenCalledWith(INEM_RECONCILE_QUEUE, 'job-1');
      expect(callOrder).toEqual(['complete', 'send']);
    });

    it('completes each job even when the handler throws, so a bad pass still frees the exclusive slot', async () => {
      const service = new InemQueueService();
      await service.onModuleInit();
      await service.workReconcile(jest.fn().mockRejectedValue(new Error('boom')));
      const registered = bossInstance.work.mock.calls[0][1] as (jobs: unknown[]) => Promise<void>;

      bossInstance.complete.mockClear();
      await expect(registered([{ id: 'job-1' }])).rejects.toThrow('boom');

      expect(bossInstance.complete).toHaveBeenCalledWith(INEM_RECONCILE_QUEUE, 'job-1');
    });

    it('buffers a workReconcile() call that arrives before onModuleInit finishes, and flushes it once boss is ready', async () => {
      const service = new InemQueueService();
      const handler = jest.fn().mockResolvedValue(undefined);

      const registerCall = service.workReconcile(handler);
      expect(bossInstance.work).not.toHaveBeenCalled();

      await service.onModuleInit();
      await registerCall;

      expect(bossInstance.work).toHaveBeenCalledWith(INEM_RECONCILE_QUEUE, expect.any(Function));
    });
  });

  it('unwraps the pg-boss job batch so the caller’s handler is invoked once per job', async () => {
    const service = new InemQueueService();
    await service.onModuleInit();
    const handler = jest.fn().mockResolvedValue(undefined);

    await service.work(INEM_RECONCILE_QUEUE, handler);
    const registered = bossInstance.work.mock.calls[0][1] as (jobs: unknown[]) => Promise<void>;
    await registered([{}, {}]);

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('stops pg-boss gracefully on destroy', async () => {
    const service = new InemQueueService();
    await service.onModuleInit();

    await service.onModuleDestroy();

    expect(bossInstance.stop).toHaveBeenCalledWith({ graceful: true, timeout: 5000 });
  });

  it('fails soft when disabled: work() buffers instead of throwing, and boss never starts', async () => {
    delete process.env.INEM_ENABLED;
    const service = new InemQueueService();

    await service.onModuleInit();
    await expect(service.work(INEM_RECONCILE_QUEUE, jest.fn())).resolves.toBeUndefined();

    expect(PgBossMock).not.toHaveBeenCalled();
  });

  it('fails soft with no DATABASE_URL', async () => {
    delete process.env.DATABASE_URL;
    const service = new InemQueueService();

    await service.onModuleInit();
    await expect(service.work(INEM_RECONCILE_QUEUE, jest.fn())).resolves.toBeUndefined();

    expect(PgBossMock).not.toHaveBeenCalled();
  });
});
