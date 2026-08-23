import { useCallback, useEffect, useRef, useState } from 'react';
import { LiveRunInput, LiveRunSyncResponse } from '@redinfo/shared';
import { ApiError, apiFetch } from '../../api';
import { useOnline } from '../../hooks/useOnline';
import { OutboxEntry, dequeue, listOutbox, loadRun, markOutboxFailure } from './liveRunDb';
import { SyncState, StatusError, syncOnce, syncState } from './liveRunSync';

/** The 30-second heartbeat, for a network that came back without an event. */
export const HEARTBEAT_MS = 30_000;
/** A burst of edits settles before anything is sent. */
export const QUEUE_DEBOUNCE_MS = 2000;

export interface LiveRunSyncHandle {
  state: SyncState;
  pending: number;
  lastSyncedAt: string | null;
  lastError: string | null;
  /** Try now — the "Tentar agora" the closing screen offers. */
  syncNow: () => void;
}

export interface UseLiveRunSyncOptions {
  /** Called with whatever the merge decided the device should now hold. */
  onMerged?: (run: LiveRunInput) => void;
  /** Off while a test or a screen wants no background traffic. */
  enabled?: boolean;
}

/**
 * The background mirror.
 *
 * Four triggers, and each earns its place: an outbox change (debounced 2s, so a
 * sentence typed is one request), the `online` event (the ambulance crests a
 * hill), `visibilitychange → visible` (back from Maps or a phone call, which is
 * when Android has most likely killed the timers), and a 30s heartbeat for the
 * network that came back without telling anyone.
 *
 * Nothing here can lose data. The device already has the run; this only decides
 * when to try again, and the policy for that lives in `liveRunSync.ts` where it
 * is unit-tested without a network.
 */
export function useLiveRunSync(options: UseLiveRunSyncOptions = {}): LiveRunSyncHandle {
  const { onMerged, enabled = true } = options;
  const online = useOnline();

  const [pending, setPending] = useState(0);
  const [inFlight, setInFlight] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  // A ref as well as state: the loop reads it to refuse to overlap itself, and
  // it must see the current value rather than the one its closure captured.
  const running = useRef(false);
  const merged = useRef(onMerged);
  merged.current = onMerged;

  const drain = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setInFlight(true);

    try {
      const queue = await listOutbox();
      setPending(queue.length);

      for (const entry of queue) {
        if (!shouldAttempt(entry)) continue;

        const stored = await loadRun(entry.runId);
        // The run is gone but the queue entry is not — abandoned, or purged.
        // Dropping the entry is the only honest thing left to do with it.
        if (!stored) {
          await dequeue(entry.runId, entry.revision);
          continue;
        }

        const outcome = await syncOnce(stored.run, { transport: { put: putRun } });

        if (outcome.kind === 'sent' || outcome.kind === 'stale') {
          await dequeue(entry.runId, entry.revision);
          setLastSyncedAt(new Date().toISOString());
          setLastError(null);
          if (outcome.run) merged.current?.(outcome.run);
        } else if (outcome.kind === 'retry') {
          await markOutboxFailure(
            entry.runId,
            outcome.error ?? 'Sync failed',
            new Date(Date.now() + (outcome.retryInMs ?? 1000)),
          );
          setLastError(outcome.error ?? null);
        } else {
          // Refused for good. The run stays on the device and the entry stays in
          // the queue, so the closing screen can say so in words — but nothing
          // retries it, because nothing about repeating it could change it.
          await markOutboxFailure(
            entry.runId,
            outcome.error ?? 'Refused',
            new Date(Date.now() + 24 * 3600_000),
          );
          setLastError(outcome.error ?? null);
        }
      }

      setPending((await listOutbox()).length);
    } finally {
      running.current = false;
      setInFlight(false);
    }
  }, []);

  const syncNow = useCallback(() => {
    void drain();
  }, [drain]);

  /** The queue's own size, polled cheaply so the chip is honest between drains. */
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const count = async () => {
      const queue = await listOutbox();
      if (!cancelled) setPending(queue.length);
    };
    void count();
    const timer = setInterval(() => void count(), QUEUE_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    const timer = setInterval(() => void drain(), HEARTBEAT_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void drain();
    };

    window.addEventListener('online', syncNow);
    document.addEventListener('visibilitychange', onVisible);
    void drain();

    return () => {
      clearInterval(timer);
      window.removeEventListener('online', syncNow);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [drain, enabled, syncNow]);

  return {
    state: syncState({ online, pending, inFlight, lastError }),
    pending,
    lastSyncedAt,
    lastError,
    syncNow,
  };
}

/** Whether the backoff allows another attempt at this entry yet. */
function shouldAttempt(entry: OutboxEntry, now: Date = new Date()): boolean {
  if (!entry.nextAttemptAt) return true;
  return new Date(entry.nextAttemptAt).getTime() <= now.getTime();
}

/**
 * The transport, with the status carried onto the error.
 *
 * `apiFetch` throws an `ApiError` that already knows the status; re-shaping it
 * here is what lets `shouldRetry` decide without the policy knowing anything
 * about this app's fetch wrapper.
 */
async function putRun(run: LiveRunInput): Promise<LiveRunSyncResponse> {
  try {
    return await apiFetch<LiveRunSyncResponse>(`/live-runs/${run.id}`, {
      method: 'PUT',
      body: run,
    });
  } catch (cause) {
    if (cause instanceof ApiError) {
      const error: StatusError = new Error(cause.message);
      error.status = cause.status;
      throw error;
    }
    throw cause;
  }
}
