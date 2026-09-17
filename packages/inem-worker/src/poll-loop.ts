import { INEMLoginJob, INEMLoginJobResult } from '@redinfo/shared';
import { BackendClient } from './backend-client';
import { Logger } from './logger';

/** Runs one claimed login job end to end and returns its result — never throws by contract, but `pollOnce` treats a throw as `unknown_error` anyway (belt and braces around whatever `login-flow.ts` does). */
export type RunLoginJob = (job: INEMLoginJob) => Promise<INEMLoginJobResult>;

/**
 * One claim/run/submit cycle. `main.ts`'s only job is to call this on a
 * timer — kept separate so the cycle itself is testable against fakes with
 * no real network or browser involved.
 *
 * Never retries on its own initiative (per #215's brief): a failure is
 * reported once, and the circuit breaker in the backend's
 * `InemSessionService` is what decides whether to hand out another job.
 */
export async function pollOnce(backend: BackendClient, runLoginJob: RunLoginJob, log: Logger): Promise<'idle' | 'ran'> {
  const job = await backend.claimJob();
  if (!job) return 'idle';

  log.info(`claimed login job ${job.id}`);

  let result: INEMLoginJobResult;
  try {
    result = await runLoginJob(job);
  } catch (err) {
    log.error(`login job ${job.id} threw: ${(err as Error).message}`);
    result = { ok: false, reason: 'unknown_error', message: (err as Error).message };
  }

  await backend.submitResult(job.id, result);
  log.info(`submitted result for job ${job.id}: ${result.ok ? 'ok' : result.reason}`);
  return 'ran';
}
