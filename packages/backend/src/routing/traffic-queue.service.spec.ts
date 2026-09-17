import { TRAFFIC_SAMPLE_QUEUE, TrafficQueueService } from './traffic-queue.service';

const bossInstance = {
  on: jest.fn(),
  start: jest.fn().mockResolvedValue(undefined),
  stop: jest.fn().mockResolvedValue(undefined),
  createQueue: jest.fn().mockResolvedValue(undefined),
  schedule: jest.fn().mockResolvedValue(undefined),
  send: jest.fn().mockResolvedValue('job-1'),
  work: jest.fn().mockResolvedValue('worker-1'),
};
const PgBossMock = jest.fn().mockImplementation(() => bossInstance);

// A getter, not a direct property — see notification-queue.service.spec.ts's
// identical comment for why (the factory runs eagerly, before PgBossMock is
// assigned).
jest.mock('pg-boss', () => ({
  get PgBoss() {
    return PgBossMock;
  },
}));

describe('TrafficQueueService', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV, DATABASE_URL: 'postgresql://test/db' };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('starts pg-boss, creates the queue and schedules the quarterly cron on init', async () => {
    const service = new TrafficQueueService();
    await service.onModuleInit();

    expect(PgBossMock).toHaveBeenCalledWith('postgresql://test/db');
    expect(bossInstance.start).toHaveBeenCalled();
    expect(bossInstance.createQueue).toHaveBeenCalledWith(TRAFFIC_SAMPLE_QUEUE);
    expect(bossInstance.schedule).toHaveBeenCalledWith(TRAFFIC_SAMPLE_QUEUE, '0 3 1 1,4,7,10 *');
  });

  it('unwraps the pg-boss job batch so the caller’s handler sees one call, not the batch', async () => {
    const service = new TrafficQueueService();
    await service.onModuleInit();
    const handler = jest.fn().mockResolvedValue(undefined);

    await service.work(handler);
    const registered = bossInstance.work.mock.calls[0][1] as (jobs: unknown[]) => Promise<void>;
    await registered([{}, {}]);

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('buffers a work() registration made before onModuleInit finishes', async () => {
    const service = new TrafficQueueService();
    const handler = jest.fn().mockResolvedValue(undefined);

    const workPromise = service.work(handler);
    await service.onModuleInit();
    await workPromise;

    expect(bossInstance.work).toHaveBeenCalledWith(TRAFFIC_SAMPLE_QUEUE, expect.any(Function));
  });

  it('triggerNow sends an immediate job onto the queue', async () => {
    const service = new TrafficQueueService();
    await service.onModuleInit();

    await service.triggerNow();

    expect(bossInstance.send).toHaveBeenCalledWith(TRAFFIC_SAMPLE_QUEUE, {});
  });

  it('stops pg-boss gracefully on destroy', async () => {
    const service = new TrafficQueueService();
    await service.onModuleInit();

    await service.onModuleDestroy();

    expect(bossInstance.stop).toHaveBeenCalledWith({ graceful: true, timeout: 5000 });
  });

  it('fails soft with no DATABASE_URL: work/triggerNow become no-ops instead of throwing', async () => {
    delete process.env.DATABASE_URL;
    const service = new TrafficQueueService();

    await service.onModuleInit();
    await expect(service.work(jest.fn())).resolves.toBeUndefined();
    await expect(service.triggerNow()).resolves.toBeUndefined();

    expect(PgBossMock).not.toHaveBeenCalled();
  });
});
