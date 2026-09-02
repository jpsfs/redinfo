import { INEMLoginJob, INEMLoginJobResult } from '@redinfo/shared';

/**
 * The worker's half of `/internal/inem/*` (see
 * `packages/backend/src/inem/inem-worker.controller.ts`). An interface
 * rather than exporting `HttpBackendClient` directly everywhere — `poll-loop.ts`
 * tests against a fake implementation so the poll/result cycle is exercised
 * with no network call in sight.
 */
export interface BackendClient {
  claimJob(): Promise<INEMLoginJob | null>;
  submitResult(jobId: string, result: INEMLoginJobResult): Promise<void>;
}

/** Thrown for anything other than the expected 2xx from a `/internal/inem/*` call. */
export class BackendClientError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'BackendClientError';
  }
}

export class HttpBackendClient implements BackendClient {
  constructor(
    private readonly baseUrl: string,
    private readonly workerToken: string,
  ) {}

  async claimJob(): Promise<INEMLoginJob | null> {
    const res = await fetch(`${this.baseUrl}/internal/inem/login-jobs`, {
      headers: this.authHeaders(),
    });
    if (!res.ok) throw new BackendClientError(`GET /internal/inem/login-jobs -> ${res.status}`, res.status);
    const body = (await res.json()) as { job: INEMLoginJob | null };
    return body.job;
  }

  async submitResult(jobId: string, result: INEMLoginJobResult): Promise<void> {
    const res = await fetch(`${this.baseUrl}/internal/inem/login-jobs/${encodeURIComponent(jobId)}/result`, {
      method: 'POST',
      headers: { ...this.authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    });
    if (!res.ok) {
      throw new BackendClientError(`POST /internal/inem/login-jobs/${jobId}/result -> ${res.status}`, res.status);
    }
  }

  /** The bootstrap script's (#215) one write — see `bootstrap.ts`. */
  async bootstrapOwaSession(storageState: unknown): Promise<void> {
    const res = await fetch(`${this.baseUrl}/internal/inem/owa-session`, {
      method: 'POST',
      headers: { ...this.authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ storageState }),
    });
    if (!res.ok) throw new BackendClientError(`POST /internal/inem/owa-session -> ${res.status}`, res.status);
  }

  private authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.workerToken}` };
  }
}
