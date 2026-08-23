import { describe, expect, it, vi } from 'vitest';
import { LiveRunInput, LiveRunState, LiveRunSyncResponse } from '@redinfo/shared';
import { emptyRun } from './liveRun';
import {
  MAX_BACKOFF_MS,
  StatusError,
  backoffMs,
  mergeRemote,
  shouldRetry,
  syncOnce,
  syncState,
} from './liveRunSync';

/**
 * The retry policy, tested without a network.
 *
 * These are the rules that go wrong in a way nobody notices for a month: a 400
 * retried forever flattens a battery in an ambulance, and a 503 not retried
 * loses a run. Injecting the transport is what makes each of them one assertion.
 */

const NOW = new Date('2026-08-22T20:14:00.000Z');
const run = (overrides: Partial<LiveRunInput> = {}): LiveRunInput => ({
  ...emptyRun('run-1', NOW),
  ...overrides,
});

/** A server answer, in the shape the API actually returns. */
const answer = (input: LiveRunInput, stale = false): LiveRunSyncResponse =>
  ({
    stale,
    run: {
      ...input,
      crew: (input.crew ?? []).map((member, index) => ({ ...member, position: index })),
      createdById: 'u-tiago',
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    },
  }) as unknown as LiveRunSyncResponse;

describe('backoffMs', () => {
  it('doubles from a second', () => {
    const noJitter = () => 0.5;
    expect(backoffMs(0, noJitter)).toBe(1000);
    expect(backoffMs(1, noJitter)).toBe(2000);
    expect(backoffMs(4, noJitter)).toBe(16_000);
  });

  it('never waits longer than half a minute', () => {
    for (const attempt of [5, 10, 40]) {
      expect(backoffMs(attempt, () => 1)).toBeLessThanOrEqual(MAX_BACKOFF_MS * 1.2);
      expect(backoffMs(attempt, () => 0.5)).toBe(MAX_BACKOFF_MS);
    }
  });

  it('spreads the herd by ±20%', () => {
    // A whole crew's devices come back into coverage as the ambulance crests a
    // hill; a fixed schedule turns that into a synchronised burst.
    expect(backoffMs(3, () => 0)).toBe(6400);
    expect(backoffMs(3, () => 1)).toBe(9600);
  });

  it('treats a nonsense attempt count as the first one', () => {
    expect(backoffMs(-4, () => 0.5)).toBe(1000);
  });
});

describe('shouldRetry', () => {
  it('always retries a request that never reached anyone', () => {
    // No network is the case this whole feature exists for.
    expect(shouldRetry(null)).toBe(true);
  });

  it('retries the statuses that mean "not now"', () => {
    for (const status of [408, 425, 429, 500, 502, 503, 504]) {
      expect(shouldRetry(status)).toBe(true);
    }
  });

  it('gives up on the statuses that mean "not ever"', () => {
    // Sending a refused document again cannot make it acceptable, and trying
    // forever is a battery leak rather than a recovery.
    for (const status of [400, 401, 403, 404, 409, 413, 422]) {
      expect(shouldRetry(status)).toBe(false);
    }
  });
});

describe('mergeRemote', () => {
  it('keeps the device’s document when it is ahead', () => {
    const local = run({ revision: 5, chiefComplaint: 'Queda' });
    const remote = run({ revision: 3, chiefComplaint: 'Something older' });
    expect(mergeRemote(local, remote).chiefComplaint).toBe('Queda');
  });

  it('takes the server’s when a second device is ahead', () => {
    // The run was handed over mid-call. The other phone is the one at the scene
    // now, so its document is the one that counts.
    const local = run({ revision: 2, chiefComplaint: 'Queda' });
    const remote = run({ revision: 6, chiefComplaint: 'Dor torácica' });
    expect(mergeRemote(local, remote).chiefComplaint).toBe('Dor torácica');
  });

  it('unions the stamps earliest-wins, in both directions', () => {
    const local = run({
      revision: 9,
      activationAt: '2026-08-22T20:14:00.000Z',
      sceneArrivalAt: null,
    });
    const remote = run({
      revision: 1,
      // A second device stamped activation later — that is a duplicate tap, not
      // a correction, so the earlier moment survives.
      activationAt: '2026-08-22T20:17:00.000Z',
      sceneArrivalAt: '2026-08-22T20:26:00.000Z',
    });

    const merged = mergeRemote(local, remote);
    expect(merged.activationAt).toBe('2026-08-22T20:14:00.000Z');
    // And a stamp only the *other* device has is still not lost.
    expect(merged.sceneArrivalAt).toBe('2026-08-22T20:26:00.000Z');
  });

  it('ends at least as high as both revisions, so the next PUT is not stale', () => {
    expect(mergeRemote(run({ revision: 2 }), run({ revision: 7 })).revision).toBe(7);
    expect(mergeRemote(run({ revision: 8 }), run({ revision: 3 })).revision).toBe(8);
  });
});

describe('syncOnce', () => {
  it('reports a document the server accepted', async () => {
    const local = run({ revision: 3, chiefComplaint: 'Queda' });
    const transport = { put: vi.fn(() => Promise.resolve(answer(local))) };

    const outcome = await syncOnce(local, { transport });

    expect(outcome.kind).toBe('sent');
    expect(transport.put).toHaveBeenCalledWith(local);
  });

  it('reports a stale replay without treating it as an error', async () => {
    const local = run({ revision: 2 });
    const stored = run({ revision: 5, state: LiveRunState.ON_SCENE });
    const transport = { put: () => Promise.resolve(answer(stored, true)) };

    const outcome = await syncOnce(local, { transport });

    // A phone that has been in a cellar gets its own later state back. That is
    // normal operation, not something to put in front of a crew mid-call.
    expect(outcome.kind).toBe('stale');
    expect(outcome.run?.revision).toBe(5);
    expect(outcome.run?.state).toBe(LiveRunState.ON_SCENE);
  });

  it('asks to be tried again after a transient failure', async () => {
    const transport = {
      put: () => Promise.reject(Object.assign(new Error('503'), { status: 503 }) as StatusError),
    };

    const outcome = await syncOnce(run(), { transport, attempt: 2, random: () => 0.5 });

    expect(outcome.kind).toBe('retry');
    expect(outcome.retryInMs).toBe(4000);
  });

  it('retries a request that never left the phone', async () => {
    const transport = { put: () => Promise.reject(new TypeError('Failed to fetch')) };
    const outcome = await syncOnce(run(), { transport, random: () => 0.5 });
    expect(outcome.kind).toBe('retry');
  });

  it('stops retrying a document the server will never accept', async () => {
    const transport = {
      put: () =>
        Promise.reject(Object.assign(new Error('Bad payload'), { status: 400 }) as StatusError),
    };

    const outcome = await syncOnce(run(), { transport });

    expect(outcome.kind).toBe('dropped');
    expect(outcome.error).toBe('Bad payload');
  });
});

describe('syncState — what the crew is told', () => {
  it('says everything is mirrored when nothing is queued', () => {
    expect(syncState({ online: true, pending: 0, inFlight: false })).toBe('synced');
  });

  it('says it is working while a request is in flight', () => {
    expect(syncState({ online: true, pending: 1, inFlight: true })).toBe('syncing');
  });

  it('says offline rather than failed when there is simply no signal', () => {
    // The crew's question is never "is the network up" — it is "will I lose
    // this". Nothing is at risk here; it just has not been mirrored yet.
    expect(syncState({ online: false, pending: 3, inFlight: false })).toBe('offline');
  });

  it('says failed only when a reachable server refused', () => {
    expect(
      syncState({ online: true, pending: 1, inFlight: false, lastError: 'Bad payload' }),
    ).toBe('failed');
  });

  it('rests at "saved on the device" when there is a queue and no complaint', () => {
    expect(syncState({ online: true, pending: 2, inFlight: false })).toBe('saved');
  });
});
