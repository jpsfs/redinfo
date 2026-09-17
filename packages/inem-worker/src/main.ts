#!/usr/bin/env ts-node
/**
 * The poll-loop entrypoint — what `Dockerfile` and
 * `deploy/redinfo/templates/deployment-worker.yaml` run. The only file in
 * this tree with side effects at import time (reading `process.env`,
 * opening a real browser), same convention as
 * `packages/legacy-migration/src/main.ts`.
 */
import { HttpBackendClient } from './backend-client';
import { loadConfig } from './config';
import { consoleLogger } from './logger';
import { runColdLogin } from './login-flow';
import { pollOnce } from './poll-loop';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const config = loadConfig();
  const backend = new HttpBackendClient(config.backendUrl, config.workerToken);
  const log = consoleLogger;

  log.info(`starting — polling ${config.backendUrl} every ${config.pollIntervalMs}ms`);

  let shuttingDown = false;
  const stop = (signal: string) => {
    log.info(`${signal} received, stopping after the current cycle`);
    shuttingDown = true;
  };
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));

  while (!shuttingDown) {
    try {
      await pollOnce(backend, (job) => runColdLogin(job, config, log), log);
    } catch (err) {
      // A claim/submit call against the backend itself failed — not a login
      // job failure (pollOnce already turns those into a submitted result).
      // The backend being briefly unreachable is not a reason to exit.
      log.error(`poll cycle failed: ${(err as Error).message}`);
    }
    await sleep(config.pollIntervalMs);
  }

  log.info('stopped');
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
