import { NOTIFICATION_DELIVER_QUEUE, NotificationQueueService } from './notification-queue.service';

const bossInstance = {
  on: jest.fn(),
  start: jest.fn().mockResolvedValue(undefined),
  stop: jest.fn().mockResolvedValue(undefined),
  createQueue: jest.fn().mockResolvedValue(undefined),
  send: jest.fn().mockResolvedValue('job-1'),
  work: jest.fn().mockResolvedValue('worker-1'),
};
const PgBossMock = jest.fn().mockImplementation(() => bossInstance);

// A getter, not a direct property: the factory runs eagerly (during the
// `import` below, before `PgBossMock` above is assigned), so `PgBoss` must
// only be read lazily — when the service under test actually does `new
// PgBoss(...)`, well after this file's module-level consts have initialized.
jest.mock('pg-boss', () => ({
  get PgBoss() {
    return PgBossMock;
  },
}));

describe('NotificationQueueService', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV, DATABASE_URL: 'postgresql://test/db' };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('starts pg-boss and creates the delivery queue on init', async () => {
    const service = new NotificationQueueService();
    await service.onModuleInit();

    expect(PgBossMock).toHaveBeenCalledWith('postgresql://test/db');
    expect(bossInstance.start).toHaveBeenCalled();
    expect(bossInstance.createQueue).toHaveBeenCalledWith(NOTIFICATION_DELIVER_QUEUE);
  });

  it('enqueues onto the delivery queue with retry options', async () => {
    const service = new NotificationQueueService();
    await service.onModuleInit();

    await service.enqueue({ deliveryId: 'd1' });

    expect(bossInstance.send).toHaveBeenCalledWith(
      NOTIFICATION_DELIVER_QUEUE,
      { deliveryId: 'd1' },
      { retryLimit: 3, retryBackoff: true },
    );
  });

  it('unwraps the pg-boss job batch so the caller’s handler sees one job at a time', async () => {
    const service = new NotificationQueueService();
    await service.onModuleInit();
    const handler = jest.fn().mockResolvedValue(undefined);

    await service.work(handler);
    const registered = bossInstance.work.mock.calls[0][1] as (jobs: { data: unknown }[]) => Promise<void>;
    await registered([{ data: { deliveryId: 'a' } }, { data: { deliveryId: 'b' } }]);

    expect(handler).toHaveBeenNthCalledWith(1, { deliveryId: 'a' });
    expect(handler).toHaveBeenNthCalledWith(2, { deliveryId: 'b' });
  });

  it('stops pg-boss gracefully on destroy', async () => {
    const service = new NotificationQueueService();
    await service.onModuleInit();

    await service.onModuleDestroy();

    expect(bossInstance.stop).toHaveBeenCalledWith({ graceful: true, timeout: 5000 });
  });

  it('fails soft with no DATABASE_URL: enqueue/work become no-ops instead of throwing', async () => {
    delete process.env.DATABASE_URL;
    const service = new NotificationQueueService();

    await service.onModuleInit();
    await expect(service.enqueue({ deliveryId: 'd1' })).resolves.toBeUndefined();
    await expect(service.work(jest.fn())).resolves.toBeUndefined();

    expect(PgBossMock).not.toHaveBeenCalled();
  });
});
