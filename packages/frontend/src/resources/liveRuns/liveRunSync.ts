import { LiveRunInput, LiveRunSyncResponse, OCCURRENCE_TIME_FIELDS } from '@redinfo/shared';

/**
 * The sync policy, as plain functions with the transport injected.
 *
 * There is deliberately no `fetch` in this file. The retry rules are the part
 * that is hard to get right and easy to get wrong in a way nobody notices for a
 * month — a 400 retried forever is a battery leak, a 503 not retried is a lost
 * run — so they are unit-testable without a network, a server or a fake timer.
 */

/** The ceiling. Half a minute is long enough to be polite, short enough to matter. */
export const MAX_BACKOFF_MS = 30_000;

/**
 * `1s · 2^attempt`, capped at 30s, with ±20% jitter.
 *
 * The jitter is not decoration: a whole crew's devices come back into coverage
 * at the same moment as the ambulance crests a hill, and a fixed schedule turns
 * that into a synchronised burst against one API.
 */
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.max(0, attempt));
  const jitter = 1 + (random() * 0.4 - 0.2);
  return Math.round(base * jitter);
}

/**
 * Whether a failed attempt is worth repeating.
 *
 * `null` means the request never reached anyone — no network, DNS, a dropped
 * connection — which is the case this whole feature is built for, so it always
 * retries.
 *
 * A 4xx is the server saying the document is wrong, and sending it again will
 * not make it right: retrying is a battery leak, not a recovery. The three
 * exceptions are the ones that mean "not now" rather than "not ever": 408, 425
 * and 429.
 */
export function shouldRetry(status: number | null): boolean {
  if (status === null) return true;
  if (status === 408 || status === 425 || status === 429) return true;
  return status >= 500;
}

/**
 * The document the device will keep, given what the server sent back.
 *
 * Device-authoritative by `revision`, because the device is the source of truth:
 * a crew's phone is the thing that was at the scene. The server's copy only wins
 * when it is *ahead*, which happens when the same run is being worked from a
 * second device — the run was handed over mid-call.
 *
 * Stamps are unioned **earliest-wins** in both directions, and that asymmetry is
 * the point: a stamp records a moment, so a later re-stamp on another device is
 * a duplicate, not a correction. There is never a merge dialog — the crew is
 * holding a patient.
 */
export function mergeRemote(local: LiveRunInput, remote: LiveRunInput): LiveRunInput {
  const winner = remote.revision > local.revision ? remote : local;
  const merged: LiveRunInput = { ...winner };

  for (const field of OCCURRENCE_TIME_FIELDS) {
    const mine = local[field];
    const theirs = remote[field];
    if (!mine) merged[field] = theirs ?? null;
    else if (!theirs) merged[field] = mine;
    else merged[field] = mine < theirs ? mine : theirs;
  }

  // The revision has to end up at least as high as both, or the next PUT is
  // answered "stale" and the device would loop sending a document the server has
  // already refused.
  merged.revision = Math.max(local.revision, remote.revision);
  return merged;
}

// ── One attempt ───────────────────────────────────────────────────────────────

export interface SyncTransport {
  /** Sends the document. Resolves with the server's answer, or throws. */
  put: (run: LiveRunInput) => Promise<LiveRunSyncResponse>;
}

export interface SyncOutcome {
  kind: 'sent' | 'stale' | 'retry' | 'dropped';
  /** What the device should now hold, when the server had something to say. */
  run?: LiveRunInput;
  /** How long to wait before trying again. Only for `retry`. */
  retryInMs?: number;
  error?: string;
}

/** An error carrying the HTTP status, which is what the retry rule reads. */
export interface StatusError extends Error {
  status?: number;
}

/**
 * One sync attempt, and what to do about the result.
 *
 * Returns a decision rather than acting on it, so the loop that owns timers and
 * IndexedDB stays out of the policy — and so every branch of the policy is one
 * assertion in a test.
 */
export async function syncOnce(
  run: LiveRunInput,
  deps: { transport: SyncTransport; attempt?: number; random?: () => number },
): Promise<SyncOutcome> {
  const { transport, attempt = 0, random = Math.random } = deps;

  try {
    const response = await transport.put(run);
    const merged = mergeRemote(run, {
      ...response.run,
      crew: response.run.crew.map((member) => ({
        userId: member.userId,
        roleName: member.roleName ?? null,
      })),
    } as LiveRunInput);

    return { kind: response.stale ? 'stale' : 'sent', run: merged };
  } catch (cause) {
    const status = (cause as StatusError).status ?? null;
    const message = cause instanceof Error ? cause.message : 'Sync failed';

    if (!shouldRetry(status)) {
      // Nothing is thrown away: the run is still on the device and still in the
      // outbox report. What stops is the retrying, because nothing about
      // repeating a refused document could change the answer.
      return { kind: 'dropped', error: message };
    }
    return { kind: 'retry', retryInMs: backoffMs(attempt, random), error: message };
  }
}

// ── What the crew is told ─────────────────────────────────────────────────────

export type SyncState = 'saved' | 'syncing' | 'synced' | 'offline' | 'failed';

/**
 * The sync chip's state.
 *
 * Always answers the crew's real question, which is not "is the network up" but
 * **"will I lose this"** — so the resting state when there is nothing queued and
 * no signal is `saved` ("gravado no dispositivo"), not an alarm. Nothing is at
 * risk; it simply has not been mirrored yet.
 */
export function syncState(input: {
  online: boolean;
  pending: number;
  inFlight: boolean;
  lastError?: string | null;
}): SyncState {
  if (input.inFlight) return 'syncing';
  if (input.pending === 0) return 'synced';
  if (!input.online) return 'offline';
  if (input.lastError) return 'failed';
  return 'saved';
}
