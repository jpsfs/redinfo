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
  schedule: jest.fn().mockResolvedValue(undefined),
  work: jest.fn().mockResolvedValue('worker-1'),
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

  it('starts pg-boss, creates all three queues and schedules them on init', async () => {
    const service = new InemQueueService();
    await service.onModuleInit();

    expect(PgBossMock).toHaveBeenCalledWith('postgresql://test/db');
    expect(bossInstance.start).toHaveBeenCalled();
    expect(bossInstance.createQueue).toHaveBeenCalledWith(INEM_RECONCILE_QUEUE);
    expect(bossInstance.createQueue).toHaveBeenCalledWith(INEM_KEEPALIVE_SESSION_QUEUE);
    expect(bossInstance.createQueue).toHaveBeenCalledWith(INEM_KEEPALIVE_SAML_QUEUE);
    expect(bossInstance.schedule).toHaveBeenCalledWith(INEM_RECONCILE_QUEUE, '* * * * *');
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
