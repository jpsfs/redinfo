import { beforeEach, describe, expect, it } from 'vitest';
import {
  LIVE_RUN_STATES,
  LIVE_RUN_STATE_RULES,
  LiveRunState,
  LiveRunSupportActionKind,
  OCCURRENCE_TIME_FIELDS,
} from '@redinfo/shared';
import {
  CURRENT_RUN_KEY,
  assessmentsOf,
  correctedStamp,
  elapsedLabel,
  emptyRun,
  isLiveScreen,
  newRunId,
  nextStamp,
  nextStampForScreen,
  patchedCapture,
  patchedIdentity,
  patchedRun,
  readCurrentRunId,
  screenForRun,
  stampedRun,
  visitedScreens,
  withAssessment,
  withNewAssessment,
  withSupportAction,
  withoutAssessment,
  writeCurrentRunId,
} from './liveRun';

/**
 * The bottom bar's whole state table, tested as data.
 *
 * `nextStamp` is the only thing that decides what the big red button says, what
 * it writes and where the run goes next — so walking every state through it is
 * the state table's test, with no component, no clock and no ambulance.
 */

const NOW = new Date('2026-08-22T20:14:00.000Z');

describe('emptyRun', () => {
  it('starts at intake with the device owning the revision', () => {
    const run = emptyRun('run-1', NOW);
    expect(run).toMatchObject({
      id: 'run-1',
      revision: 0,
      state: LiveRunState.INTAKE,
      startedAt: NOW.toISOString(),
    });
  });

  it('guesses nothing, not even the location type', () => {
    // A default that is right often enough to stop being read is worse than a
    // blank — the same rule `emptyDraft` follows.
    const run = emptyRun('run-1', NOW);
    expect(run.locationType).toBeNull();
    expect(run.localityId).toBeNull();
    expect(run.externalReference).toBeNull();
    expect(run.victimGender).toBeNull();
  });

  it('has no stamps at all yet', () => {
    const run = emptyRun('run-1', NOW);
    for (const field of OCCURRENCE_TIME_FIELDS) {
      expect(run[field]).toBeNull();
    }
  });
});

describe('newRunId', () => {
  it('only uses characters the API will accept', () => {
    for (let index = 0; index < 20; index += 1) {
      expect(newRunId(NOW)).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it('is unique across a burst', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newRunId(NOW)));
    expect(ids.size).toBe(50);
  });
});

describe('nextStamp — the bottom bar', () => {
  it('names a stamp and a destination for every state but CLOSED', () => {
    for (const state of LIVE_RUN_STATES) {
      const step = nextStamp({ ...emptyRun('run-1', NOW), state });
      if (state === LiveRunState.CLOSED) {
        expect(step).toBeNull();
        continue;
      }
      expect(step).not.toBeNull();
      expect(OCCURRENCE_TIME_FIELDS).toContain(step!.field);
      expect(step!.state).toBe(LIVE_RUN_STATE_RULES[state].next);
    }
  });

  it('says the transition is already done once its time is marked', () => {
    const run = { ...emptyRun('run-1', NOW), activationAt: NOW.toISOString() };
    expect(nextStamp(run)).toMatchObject({ field: 'activationAt', done: true });
  });
});

describe('stampedRun', () => {
  it('writes the time and moves the run on', () => {
    const run = stampedRun(emptyRun('run-1', NOW), NOW);
    expect(run.state).toBe(LiveRunState.EN_ROUTE);
    expect(run.activationAt).toBe(NOW.toISOString());
    expect(run.revision).toBe(1);
  });

  it('never overwrites a time that is already there', () => {
    // A stamp records a moment. Re-tapping is a mis-tap, not a correction — and
    // the correction path is deliberate.
    const first = stampedRun(emptyRun('run-1', NOW), NOW);
    const again = stampedRun({ ...first, state: LiveRunState.INTAKE }, new Date('2026-08-22T21:00:00.000Z'));
    expect(again.activationAt).toBe(NOW.toISOString());
  });

  it('walks the whole run from intake to closed, stamping each step once', () => {
    let run = emptyRun('run-1', NOW);
    const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

    run = stampedRun(run, at(0)); // activation
    run = stampedRun(run, at(12)); // scene arrival
    run = stampedRun(run, at(34)); // scene departure
    run = stampedRun(run, at(60)); // hospital arrival
    run = stampedRun(run, at(85)); // available

    expect(run.state).toBe(LiveRunState.CLOSED);
    expect(OCCURRENCE_TIME_FIELDS.map((field) => run[field])).toEqual([
      at(0).toISOString(),
      at(12).toISOString(),
      at(34).toISOString(),
      at(60).toISOString(),
      at(85).toISOString(),
    ]);
    // Five taps, five revisions — the device's counter is what the server orders
    // by, so it has to move on every one.
    expect(run.revision).toBe(5);
  });

  it('does nothing at all once the run is closed', () => {
    const closed = { ...emptyRun('run-1', NOW), state: LiveRunState.CLOSED };
    expect(stampedRun(closed, NOW)).toBe(closed);
  });
});

describe('correctedStamp', () => {
  it('rewrites the one time it was given', () => {
    const run = stampedRun(emptyRun('run-1', NOW), NOW);
    const fixed = correctedStamp(run, 'activationAt', '2026-08-22T20:09:00.000Z');
    expect(fixed.activationAt).toBe('2026-08-22T20:09:00.000Z');
    expect(fixed.state).toBe(run.state);
    expect(fixed.revision).toBe(run.revision + 1);
  });

  it('can clear a time that was stamped by mistake', () => {
    const run = stampedRun(emptyRun('run-1', NOW), NOW);
    expect(correctedStamp(run, 'activationAt', null).activationAt).toBeNull();
  });
});

describe('screens', () => {
  it('sends every state to a screen the router knows', () => {
    for (const state of LIVE_RUN_STATES) {
      const screen = screenForRun({ state });
      expect(isLiveScreen(screen)).toBe(true);
    }
  });

  it('falls back to intake for a state written by a newer version of the app', () => {
    expect(screenForRun({ state: 'TELEPORTING' as LiveRunState })).toBe('intake');
  });

  it('refuses a screen nobody has heard of', () => {
    expect(isLiveScreen('vitals')).toBe(false);
    expect(isLiveScreen(undefined)).toBe(false);
  });
});

describe('visitedScreens — the top bar jump row', () => {
  it('is just the one screen at intake', () => {
    expect(visitedScreens({ state: LiveRunState.INTAKE })).toEqual(['intake']);
  });

  it('grows with every step the run has actually taken', () => {
    expect(visitedScreens({ state: LiveRunState.ON_SCENE })).toEqual(['intake', 'enroute', 'scene']);
  });

  it('never names a screen the run has not reached yet', () => {
    const visited = visitedScreens({ state: LiveRunState.EN_ROUTE });
    expect(visited).not.toContain('scene');
    expect(visited).not.toContain('transport');
  });

  it('leaves assessment out — it is a branch off scene, not a stop on the walk', () => {
    expect(visitedScreens({ state: LiveRunState.AT_HOSPITAL })).not.toContain('assessment');
  });

  it('reaches closing once the run is closed', () => {
    expect(visitedScreens({ state: LiveRunState.CLOSED })).toEqual([
      'intake',
      'enroute',
      'scene',
      'transport',
      'closing',
    ]);
  });
});

describe('nextStampForScreen — the bottom bar when browsing history', () => {
  it('is nextStamp unchanged on the run’s real screen', () => {
    const run = { ...emptyRun('run-1', NOW), state: LiveRunState.EN_ROUTE };
    expect(nextStampForScreen(run, 'enroute')).toEqual(nextStamp(run));
  });

  it('offers the correction for a screen the run has already passed, not the live action', () => {
    const run = {
      ...emptyRun('run-1', NOW),
      state: LiveRunState.EN_ROUTE_TO_HOSPITAL,
      activationAt: NOW.toISOString(),
      sceneArrivalAt: '2026-08-22T20:26:00.000Z',
      sceneDepartureAt: '2026-08-22T20:34:00.000Z',
    };
    // Browsed back to `scene` with the run really on `transport`: the field
    // `scene` writes is already stamped, so this must read `done`, never the
    // hospital-arrival action that belongs to the real screen.
    expect(nextStampForScreen(run, 'scene')).toMatchObject({
      field: 'sceneDepartureAt',
      done: true,
    });
  });

  it('always mirrors the real action on assessment, which has no stamp of its own', () => {
    const run = { ...emptyRun('run-1', NOW), state: LiveRunState.ON_SCENE };
    expect(nextStampForScreen(run, 'assessment')).toEqual(nextStamp(run));
  });
});

describe('patching', () => {
  it('counts the revision up on every change', () => {
    const run = patchedRun(emptyRun('run-1', NOW), { chiefComplaint: 'Queda' });
    expect(run.chiefComplaint).toBe('Queda');
    expect(run.revision).toBe(1);
  });

  it('merges identity without disturbing the rest of the run', () => {
    let run = patchedIdentity(emptyRun('run-1', NOW), { victimName: 'Maria' });
    run = patchedIdentity(run, { victimSnsNumber: '123456789' });
    expect(run.identity).toEqual({ victimName: 'Maria', victimSnsNumber: '123456789' });
  });

  it('merges capture without dropping the assessments already taken', () => {
    let run = withNewAssessment(emptyRun('run-1', NOW), NOW).run;
    run = patchedCapture(run, { chamuHistory: 'HTA' });
    expect(assessmentsOf(run)).toHaveLength(1);
    expect(run.capture?.chamuHistory).toBe('HTA');
  });
});

describe('assessments', () => {
  it('adds a set stamped now, and says which one it is', () => {
    const first = withNewAssessment(emptyRun('run-1', NOW), NOW);
    expect(first.index).toBe(0);
    expect(assessmentsOf(first.run)[0].takenAt).toBe(NOW.toISOString());

    const second = withNewAssessment(first.run, new Date('2026-08-22T20:41:00.000Z'));
    expect(second.index).toBe(1);
    expect(assessmentsOf(second.run)).toHaveLength(2);
  });

  it('changes only the set it was pointed at', () => {
    let run = withNewAssessment(emptyRun('run-1', NOW), NOW).run;
    run = withNewAssessment(run, new Date('2026-08-22T20:41:00.000Z')).run;

    run = withAssessment(run, 1, { spo2: 94 });

    // "What were the vitals when we arrived" must not be overwritten by "what
    // were they when we left" — that is why these are a list at all.
    expect(assessmentsOf(run)[0].spo2).toBeUndefined();
    expect(assessmentsOf(run)[1].spo2).toBe(94);
  });

  it('ignores a change to a set that is not there', () => {
    const run = emptyRun('run-1', NOW);
    expect(withAssessment(run, 3, { spo2: 94 })).toBe(run);
  });

  it('removes one and leaves the rest', () => {
    let run = withNewAssessment(emptyRun('run-1', NOW), NOW).run;
    run = withNewAssessment(run, new Date('2026-08-22T20:41:00.000Z')).run;
    run = withAssessment(run, 0, { spo2: 97 });

    run = withoutAssessment(run, 1);
    expect(assessmentsOf(run)).toHaveLength(1);
    expect(assessmentsOf(run)[0].spo2).toBe(97);
  });
});

describe('support actions', () => {
  it('records that the line was dialled, and when', () => {
    const run = withSupportAction(
      emptyRun('run-1', NOW),
      LiveRunSupportActionKind.CODU_DADOS,
      NOW,
    );
    expect(run.capture?.supportActions).toEqual([
      { kind: LiveRunSupportActionKind.CODU_DADOS, at: NOW.toISOString() },
    ]);
  });

  it('keeps every call, because two calls are two facts', () => {
    let run = withSupportAction(emptyRun('run-1', NOW), LiveRunSupportActionKind.CODU_DADOS, NOW);
    run = withSupportAction(
      run,
      LiveRunSupportActionKind.CODU_DADOS,
      new Date('2026-08-22T20:31:00.000Z'),
    );
    expect(run.capture?.supportActions).toHaveLength(2);
  });
});

describe('the run clock', () => {
  const at = (minutes: number, seconds = 0) =>
    new Date(NOW.getTime() + minutes * 60_000 + seconds * 1000);

  it('counts from activation once there is one', () => {
    const run = { ...emptyRun('run-1', new Date('2026-08-22T20:00:00.000Z')), activationAt: NOW.toISOString() };
    expect(elapsedLabel(run, at(3, 7))).toBe('03:07');
  });

  it('counts from the moment the screen opened before activation', () => {
    expect(elapsedLabel(emptyRun('run-1', NOW), at(0, 42))).toBe('00:42');
  });

  it('grows an hours field rather than counting past 59 minutes', () => {
    expect(elapsedLabel(emptyRun('run-1', NOW), at(74, 5))).toBe('1:14:05');
  });

  it('never reads negative, however wrong the phone’s clock is', () => {
    expect(elapsedLabel(emptyRun('run-1', NOW), at(-30))).toBe('00:00');
  });
});

describe('the pointer to the open run', () => {
  beforeEach(() => window.localStorage.clear());

  it('remembers and forgets the run in hand', () => {
    expect(readCurrentRunId()).toBeNull();
    writeCurrentRunId('run-7');
    expect(window.localStorage.getItem(CURRENT_RUN_KEY)).toBe('run-7');
    expect(readCurrentRunId()).toBe('run-7');
    writeCurrentRunId(null);
    expect(readCurrentRunId()).toBeNull();
  });
});
