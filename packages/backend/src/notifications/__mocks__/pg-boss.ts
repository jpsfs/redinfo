/**
 * jest replacement for the real `pg-boss` package, wired in globally via the
 * backend's `moduleNameMapper` (see `package.json`).
 *
 * `pg-boss` ships pure ESM, which jest's CommonJS transform can't parse
 * straight out of `node_modules` — every spec that imports the module chain
 * through `notification-queue.service.ts` (directly, or transitively via
 * `AppModule`) would otherwise fail to even parse. `NotificationQueueService`
 * fails soft with no `DATABASE_URL` (the case in every unit-test process), so
 * a class whose methods just resolve is enough for the graph to build; a spec
 * that needs to assert on real start/send/work calls provides its own
 * `jest.mock('pg-boss', ...)`, which takes precedence over this one.
 */
export class PgBoss {
  on = jest.fn();
  start = jest.fn().mockResolvedValue(undefined);
  stop = jest.fn().mockResolvedValue(undefined);
  createQueue = jest.fn().mockResolvedValue(undefined);
  send = jest.fn().mockResolvedValue(null);
  work = jest.fn().mockResolvedValue('worker-id');
}
