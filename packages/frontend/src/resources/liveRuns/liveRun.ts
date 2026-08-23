import {
  AssessmentInput,
  EventLocationType,
  LIVE_RUN_STATE_RULES,
  LIVE_SCREENS,
  LiveRun,
  LiveRunCapture,
  LiveRunIdentity,
  LiveRunInput,
  LiveScreen,
  LiveRunState,
  LiveRunSupportActionKind,
  OccurrenceTimeField,
} from '@redinfo/shared';

/**
 * The live run as data — no React in here.
 *
 * Everything the six screens, the bottom bar and the sync loop have to agree on
 * lives in this file as plain functions, for the same reason `reportDraft.ts`
 * exists: the hard parts are then provable without rendering anything, and the
 * screens cannot drift from each other.
 *
 * The bar's whole state table is `nextStamp` — one pure function — so "what does
 * the big button say and what does it write" is a unit test rather than a
 * component test with a stubbed clock.
 */

/** The one open run this device is working on, remembered across a reload. */
export const CURRENT_RUN_KEY = 'redinfo.liveRun.current.v1';

// ── Screens ───────────────────────────────────────────────────────────────────

/** The screen a state is worked on. Also the URL segment. */
export function screenForState(state: LiveRunState | string): LiveScreen {
  return LIVE_RUN_STATE_RULES[state as LiveRunState]?.screen ?? 'intake';
}

export function isLiveScreen(value: string | undefined): value is LiveScreen {
  return Boolean(value) && LIVE_SCREENS.includes(value as LiveScreen);
}

/**
 * The screen to open a run on.
 *
 * `assessment` is deliberately never landed on automatically: it is reached from
 * the scene screen, and dropping a crew that has just reopened the app straight
 * into a vitals grid loses them the context of where the run had got to.
 */
export function screenForRun(run: Pick<LiveRunInput, 'state'>): LiveScreen {
  return screenForState(run.state);
}

// ── An empty run ──────────────────────────────────────────────────────────────

/**
 * A new run, pre-filled with what is knowable without asking.
 *
 * `revision` starts at 0 and is the device's own counter: the server trusts no
 * other ordering, and a run created in a dead spot has to be able to count up
 * without asking anyone.
 *
 * The location type is not guessed, for the same reason `emptyDraft` does not
 * guess it: a default that is right often enough to stop being read is worse
 * than a blank.
 */
export function emptyRun(id: string, now: Date = new Date()): LiveRunInput {
  return {
    id,
    revision: 0,
    state: LiveRunState.INTAKE,
    startedAt: now.toISOString(),
    externalReference: null,
    chiefComplaint: null,
    locationType: null as EventLocationType | null,
    localityId: null,
    victimGender: null,
    victimAge: null,
    vehicleId: null,
    crew: [],
    shift: null,
    activationAt: null,
    sceneArrivalAt: null,
    sceneDepartureAt: null,
    hospitalArrivalAt: null,
    availableAt: null,
    destinationKind: null,
    destinationHospitalId: null,
    identity: {},
    capture: { notes: null, assessments: [], supportActions: [] },
    closedAt: null,
  };
}

/**
 * A run id the device owns.
 *
 * `crypto.randomUUID` where it exists, and a timestamp-plus-random fallback
 * where it does not — an old Android WebView on http (a field laptop's hotspot)
 * has no `crypto.randomUUID`, and "the app will not start a run" is not an
 * acceptable answer to that. Constrained to the charset the API's DTO pins.
 */
export function newRunId(now: Date = new Date()): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  const random = Math.floor(Math.random() * 1e12).toString(36);
  return `${now.getTime().toString(36)}-${random}`;
}

/** A stored run from the server, back in the shape the screens edit. */
export function runFromRemote(remote: LiveRun): LiveRunInput {
  return {
    id: remote.id,
    revision: remote.revision,
    state: remote.state,
    startedAt: remote.startedAt,
    externalReference: remote.externalReference ?? null,
    chiefComplaint: remote.chiefComplaint ?? null,
    locationType: remote.locationType ?? null,
    localityId: remote.localityId ?? null,
    victimGender: remote.victimGender ?? null,
    victimAge: remote.victimAge ?? null,
    vehicleId: remote.vehicleId ?? null,
    crew: remote.crew.map((member) => ({
      userId: member.userId,
      roleName: member.roleName ?? null,
    })),
    shift: remote.shift ?? null,
    activationAt: remote.activationAt ?? null,
    sceneArrivalAt: remote.sceneArrivalAt ?? null,
    sceneDepartureAt: remote.sceneDepartureAt ?? null,
    hospitalArrivalAt: remote.hospitalArrivalAt ?? null,
    availableAt: remote.availableAt ?? null,
    destinationKind: remote.destinationKind ?? null,
    destinationHospitalId: remote.destinationHospitalId ?? null,
    identity: remote.identity ?? {},
    capture: remote.capture ?? { notes: null, assessments: [], supportActions: [] },
    closedAt: remote.closedAt ?? null,
  };
}

// ── The bottom bar's state table ──────────────────────────────────────────────

export interface NextStamp {
  /** The timestamp this transition writes. */
  field: OccurrenceTimeField;
  /** The state the run moves to. */
  state: LiveRunState;
  /** Already stamped — the bar offers a correction rather than overwriting. */
  done: boolean;
}

/**
 * What the bottom bar's primary control does next, or null when there is none.
 *
 * Read off `LIVE_RUN_STATE_RULES` rather than a chain of `if`s, so the label,
 * the stamp and the destination state are one fact about a state — and so the
 * state table *is* the unit test.
 *
 * `done` follows the same `value ? change : now` rule the report form already
 * uses: tapping an already-stamped transition opens the correction sheet instead
 * of silently overwriting a time the crew is going to be asked about later.
 */
export function nextStamp(run: Pick<LiveRunInput, 'state'> & Partial<LiveRunInput>): NextStamp | null {
  const rules = LIVE_RUN_STATE_RULES[run.state as LiveRunState];
  if (!rules?.stamps || !rules.next) return null;
  return {
    field: rules.stamps,
    state: rules.next,
    done: Boolean(run[rules.stamps]),
  };
}

/**
 * Stamps the transition and moves the run on.
 *
 * Never overwrites: a stamp records a moment, so an already-marked time is left
 * alone and only the state advances. Correcting a time is `correctedStamp`, which
 * the crew reaches deliberately.
 */
export function stampedRun(run: LiveRunInput, now: Date = new Date()): LiveRunInput {
  const step = nextStamp(run);
  if (!step) return run;
  return {
    ...run,
    state: step.state,
    [step.field]: run[step.field] ?? now.toISOString(),
    revision: run.revision + 1,
  };
}

/**
 * Rewrites one timestamp, keeping the chronology in order.
 *
 * A correction is the one place a stamp may move, and it is offered because the
 * alternative is worse: a crew that tapped "cheguei" in the wrong order writes
 * the truth into the narrative later, where nothing can read it.
 */
export function correctedStamp(
  run: LiveRunInput,
  field: OccurrenceTimeField,
  instant: string | null,
): LiveRunInput {
  return { ...run, [field]: instant, revision: run.revision + 1 };
}

/** Merges a patch in and counts the device's revision up. */
export function patchedRun(run: LiveRunInput, changes: Partial<LiveRunInput>): LiveRunInput {
  return { ...run, ...changes, revision: run.revision + 1 };
}

/** Merges into the identity block without disturbing the rest of the run. */
export function patchedIdentity(
  run: LiveRunInput,
  changes: Partial<LiveRunIdentity>,
): LiveRunInput {
  return patchedRun(run, { identity: { ...(run.identity ?? {}), ...changes } });
}

/** Merges into the capture block — vitals, CHAMU, ABCDE, the narrative. */
export function patchedCapture(
  run: LiveRunInput,
  changes: Partial<LiveRunCapture>,
): LiveRunInput {
  return patchedRun(run, { capture: { ...(run.capture ?? {}), ...changes } });
}

// ── Assessments ───────────────────────────────────────────────────────────────

/** The sets of observations on a run, oldest first. */
export function assessmentsOf(run: LiveRunInput): AssessmentInput[] {
  return run.capture?.assessments ?? [];
}

/** Adds an empty set of observations, stamped now, and says which index it is. */
export function withNewAssessment(
  run: LiveRunInput,
  now: Date = new Date(),
): { run: LiveRunInput; index: number } {
  const existing = assessmentsOf(run);
  const next = [...existing, { takenAt: now.toISOString() }];
  return { run: patchedCapture(run, { assessments: next }), index: existing.length };
}

export function withAssessment(
  run: LiveRunInput,
  index: number,
  changes: Partial<AssessmentInput>,
): LiveRunInput {
  const existing = assessmentsOf(run);
  if (index < 0 || index >= existing.length) return run;
  const next = existing.map((entry, at) => (at === index ? { ...entry, ...changes } : entry));
  return patchedCapture(run, { assessments: next });
}

export function withoutAssessment(run: LiveRunInput, index: number): LiveRunInput {
  const next = assessmentsOf(run).filter((_, at) => at !== index);
  return patchedCapture(run, { assessments: next });
}

// ── Support actions ───────────────────────────────────────────────────────────

/**
 * Records that a support line was dialled, and when.
 *
 * The dial itself is a `tel:` link the OS handles; what the report needs is the
 * moment it happened, which nothing else can reconstruct afterwards.
 */
export function withSupportAction(
  run: LiveRunInput,
  kind: LiveRunSupportActionKind,
  now: Date = new Date(),
): LiveRunInput {
  const existing = run.capture?.supportActions ?? [];
  return patchedCapture(run, {
    supportActions: [...existing, { kind, at: now.toISOString() }],
  });
}

// ── The run clock ─────────────────────────────────────────────────────────────

/**
 * How long the run has been going, as `MM:SS` under an hour and `H:MM:SS` over.
 *
 * From activation where there is one, and from the moment the screen was opened
 * where there is not — the crew's question is "how long has this call been
 * running", and it starts on the call from CODU rather than at the door.
 */
export function elapsedLabel(run: LiveRunInput, now: Date = new Date()): string {
  const from = new Date(run.activationAt ?? run.startedAt).getTime();
  if (!Number.isFinite(from)) return '—';
  const seconds = Math.max(0, Math.floor((now.getTime() - from) / 1000));
  const pad = (value: number) => String(value).padStart(2, '0');
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds % 60)}`
    : `${pad(minutes)}:${pad(seconds % 60)}`;
}

// ── The pointer to the open run ───────────────────────────────────────────────

/**
 * Which run this device is in the middle of, in `localStorage`.
 *
 * `localStorage` and not IndexedDB purely because it is **synchronous**: the two
 * entry points into live mode have to read "is a run already open" before first
 * paint, or the button reads "Registar em direto" for a moment on a phone that
 * is halfway through a call — which is the one moment the label matters.
 */
export function readCurrentRunId(): string | null {
  try {
    return window.localStorage.getItem(CURRENT_RUN_KEY) || null;
  } catch {
    return null;
  }
}

export function writeCurrentRunId(id: string | null): void {
  try {
    if (id) window.localStorage.setItem(CURRENT_RUN_KEY, id);
    else window.localStorage.removeItem(CURRENT_RUN_KEY);
  } catch {
    // Private browsing, or a full quota. The run is still in IndexedDB and in
    // memory; only the shortcut back to it is gone.
  }
}
