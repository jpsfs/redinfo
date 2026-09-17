/**
 * Environment plumbing. Deliberately not `@redinfo/shared`'s env style (this
 * package can't reuse anything backend-side) — a handful of `required()`
 * calls is all this needs.
 *
 * No `INEM_ENABLED` here: unlike the backend module, this process has
 * nothing useful to do when disabled, so an operator simply doesn't start
 * it rather than the process running and no-op-ing forever.
 */
import { DEFAULT_OWA_TIME_ZONE } from './otp-mail';

export interface WorkerConfig {
  /** Base URL of packages/backend, e.g. `http://backend:3000` in compose or the k8s Service DNS name. */
  backendUrl: string;
  /** Shared secret for `/internal/inem/*` — must match the backend's `INEM_WORKER_TOKEN`. */
  workerToken: string;
  /** `portalpem.inem.pt` and `fac.inem.pt` share this scheme+host pair; see docs/inem-portal-contract.md. */
  inemBaseUrl: string;
  username: string;
  password: string;
  pollIntervalMs: number;
  /**
   * Optional UA override. When unset the worker strips the `Headless` marker
   * from Chromium's own default (see login-flow.ts) — INEM's FortiGate blocks
   * the literal `HeadlessChrome` User-Agent token with a FortiGuard block
   * page. Set `INEM_USER_AGENT` to pin an exact string if that filter ever
   * tightens further.
   */
  userAgent?: string;
  /**
   * IANA zone the OWA mailbox renders its message list in. OWA uses the
   * *mailbox's* timezone rather than the browser's, so this cannot be pinned
   * via Playwright — see `otp-mail.ts`'s `DEFAULT_OWA_TIME_ZONE`.
   */
  owaTimeZone: string;
}

/** Thrown for a missing required var — every one of these is a startup-time configuration mistake. */
export class MissingConfigError extends Error {
  constructor(readonly key: string) {
    super(`${key} is required`);
    this.name = 'MissingConfigError';
  }
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (!value) throw new MissingConfigError(key);
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  return {
    backendUrl: required(env, 'BACKEND_URL').replace(/\/$/, ''),
    workerToken: required(env, 'INEM_WORKER_TOKEN'),
    inemBaseUrl: (env.INEM_BASE_URL ?? 'https://portalpem.inem.pt').replace(/\/$/, ''),
    username: required(env, 'INEM_USERNAME'),
    password: required(env, 'INEM_PASSWORD'),
    pollIntervalMs: Number(env.INEM_WORKER_POLL_INTERVAL_MS ?? 15_000),
    userAgent: env.INEM_USER_AGENT || undefined,
    owaTimeZone: env.OWA_TIME_ZONE || DEFAULT_OWA_TIME_ZONE,
  };
}
