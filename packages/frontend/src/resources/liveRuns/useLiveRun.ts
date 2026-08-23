import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AssessmentInput,
  EventReportProblem,
  LiveRunBlockerCode,
  LiveRunCapture,
  LiveRunIdentity,
  LiveRunInput,
  LiveRunState,
  LiveRunSupportActionKind,
  LiveRunWarningCode,
  OccurrenceTimeField,
  canCloseLiveRun,
  liveRunCloseBlockers,
  liveRunWarnings,
  validateLiveRun,
} from '@redinfo/shared';
import {
  assessmentsOf,
  correctedStamp,
  emptyRun,
  nextStamp,
  patchedCapture,
  patchedIdentity,
  patchedRun,
  stampedRun,
  withAssessment,
  withNewAssessment,
  withSupportAction,
  withoutAssessment,
  writeCurrentRunId,
} from './liveRun';
import { enqueue, loadRun, saveRun } from './liveRunDb';

/** How long a burst of typing is allowed to settle before it is written. */
export const TEXT_DEBOUNCE_MS = 250;

export interface UseLiveRunOptions {
  runId: string;
  /** A run the server already has — resumed on a second device. */
  initial?: LiveRunInput | null;
}

export interface LiveRunHandle {
  run: LiveRunInput;
  /** False until the device's own copy has been read. */
  ready: boolean;

  /** A change worth protecting: stamps, choices, outcomes. Written at once. */
  patch: (changes: Partial<LiveRunInput>) => void;
  /** A change that is still being typed. Written after it settles. */
  patchLater: (changes: Partial<LiveRunInput>) => void;
  patchIdentity: (changes: Partial<LiveRunIdentity>) => void;
  patchIdentityLater: (changes: Partial<LiveRunIdentity>) => void;
  patchCapture: (changes: Partial<LiveRunCapture>) => void;
  patchCaptureLater: (changes: Partial<LiveRunCapture>) => void;

  /** Advance the run and stamp the transition. The bottom bar's primary act. */
  stamp: () => void;
  correct: (field: OccurrenceTimeField, instant: string | null) => void;
  recordSupportAction: (kind: LiveRunSupportActionKind) => void;

  assessments: AssessmentInput[];
  addAssessment: () => number;
  editAssessment: (index: number, changes: Partial<AssessmentInput>) => void;
  removeAssessment: (index: number) => void;

  /** What the bottom bar's control does next, or null at the end. */
  next: ReturnType<typeof nextStamp>;
  error: EventReportProblem | null;
  warnings: LiveRunWarningCode[];
  blockers: LiveRunBlockerCode[];
  canClose: boolean;

  /** When the device last wrote it — the "gravado" caption. */
  savedAt: string | null;
  /** Replaces the whole document, after a sync or a close. */
  replace: (run: LiveRunInput) => void;
}

/**
 * The live run's state, and the promise that nothing is lost.
 *
 * The `useEventReportDraft` analogue, with one deliberate difference:
 * **write discipline is not uniform.** A stamp, an outcome, a photograph
 * reference and the close mapping are written through to IndexedDB *immediately*
 * — those are the facts this feature exists to protect, and a 250ms debounce
 * that eats a stamp because the phone locked 200ms later is the exact failure it
 * must not have. Typing is debounced, at the same interval `LocalityPicker`
 * already uses.
 *
 * Every write also queues a sync. Queueing is keyed by run, so a burst of
 * keystrokes is one request rather than forty.
 */
export function useLiveRun(options: UseLiveRunOptions): LiveRunHandle {
  const { runId, initial = null } = options;

  const [run, setRun] = useState<LiveRunInput>(() => initial ?? emptyRun(runId));
  const [ready, setReady] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // The pending write, so a debounced patch that is still in flight when the
  // crew taps a stamp is flushed rather than lost.
  const pending = useRef<{ run: LiveRunInput; timer: ReturnType<typeof setTimeout> } | null>(null);

  const write = useCallback(async (next: LiveRunInput) => {
    const now = new Date();
    await saveRun(next, {}, now);
    await enqueue(next.id, next.revision, now);
    setSavedAt(now.toISOString());
  }, []);

  const flush = useCallback(() => {
    const outstanding = pending.current;
    if (!outstanding) return;
    clearTimeout(outstanding.timer);
    pending.current = null;
    void write(outstanding.run);
  }, [write]);

  /** Reads the device's own copy first. It is the source of truth. */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await loadRun(runId);
      if (cancelled) return;
      if (stored) {
        // Local wins on load: the device is what was at the scene, and a run
        // reopened after a reload must come back exactly as it was left.
        setRun(stored.run);
        setSavedAt(stored.savedAt);
      } else {
        const seed = initial ?? emptyRun(runId);
        setRun(seed);
        await write(seed);
      }
      writeCurrentRunId(runId);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
    // `initial` is a seed, deliberately read once: re-reading it would let a
    // server response overwrite what the crew has typed since.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, write]);

  /** A flush on the way out, so unmounting mid-word does not drop the word. */
  useEffect(() => flush, [flush]);

  const apply = useCallback(
    (change: (current: LiveRunInput) => LiveRunInput, immediate: boolean) => {
      setRun((current) => {
        const base = pending.current?.run ?? current;
        const next = change(base);

        if (pending.current) clearTimeout(pending.current.timer);
        if (immediate) {
          pending.current = null;
          void write(next);
        } else {
          pending.current = {
            run: next,
            timer: setTimeout(() => {
              pending.current = null;
              void write(next);
            }, TEXT_DEBOUNCE_MS),
          };
        }
        return next;
      });
    },
    [write],
  );

  const patch = useCallback(
    (changes: Partial<LiveRunInput>) => apply((current) => patchedRun(current, changes), true),
    [apply],
  );
  const patchLater = useCallback(
    (changes: Partial<LiveRunInput>) => apply((current) => patchedRun(current, changes), false),
    [apply],
  );
  const patchIdentity = useCallback(
    (changes: Partial<LiveRunIdentity>) =>
      apply((current) => patchedIdentity(current, changes), true),
    [apply],
  );
  const patchIdentityLater = useCallback(
    (changes: Partial<LiveRunIdentity>) =>
      apply((current) => patchedIdentity(current, changes), false),
    [apply],
  );
  const patchCapture = useCallback(
    (changes: Partial<LiveRunCapture>) =>
      apply((current) => patchedCapture(current, changes), true),
    [apply],
  );
  const patchCaptureLater = useCallback(
    (changes: Partial<LiveRunCapture>) =>
      apply((current) => patchedCapture(current, changes), false),
    [apply],
  );

  const stamp = useCallback(() => {
    // A stamp is the one thing that must never wait: it is written through, and
    // it flushes whatever was being typed on the way.
    apply((current) => stampedRun(current, new Date()), true);
  }, [apply]);

  const correct = useCallback(
    (field: OccurrenceTimeField, instant: string | null) =>
      apply((current) => correctedStamp(current, field, instant), true),
    [apply],
  );

  const recordSupportAction = useCallback(
    (kind: LiveRunSupportActionKind) =>
      apply((current) => withSupportAction(current, kind, new Date()), true),
    [apply],
  );

  /**
   * Adds a set of observations and says which index it is, so the caller can
   * page to it.
   *
   * The index is computed from the state the reducer will see, not from the
   * render's copy: two taps in the same tick must not both return 0.
   */
  const addAssessment = useCallback((): number => {
    const base = pending.current?.run ?? run;
    const index = assessmentsOf(base).length;
    apply((current) => withNewAssessment(current, new Date()).run, true);
    return index;
  }, [apply, run]);

  const editAssessment = useCallback(
    (index: number, changes: Partial<AssessmentInput>) =>
      // Debounced: vitals are typed. The set itself already exists, stamped, so
      // nothing about *when* it was taken is at risk.
      apply((current) => withAssessment(current, index, changes), false),
    [apply],
  );

  const removeAssessment = useCallback(
    (index: number) => apply((current) => withoutAssessment(current, index), true),
    [apply],
  );

  const replace = useCallback(
    (next: LiveRunInput) => {
      if (pending.current) clearTimeout(pending.current.timer);
      pending.current = null;
      setRun(next);
      void saveRun(next).then(() => setSavedAt(new Date().toISOString()));
    },
    [],
  );

  const error = useMemo(() => validateLiveRun(run), [run]);
  const warnings = useMemo(() => liveRunWarnings(run), [run]);
  const blockers = useMemo(() => liveRunCloseBlockers(run), [run]);

  return {
    run,
    ready,
    patch,
    patchLater,
    patchIdentity,
    patchIdentityLater,
    patchCapture,
    patchCaptureLater,
    stamp,
    correct,
    recordSupportAction,
    assessments: assessmentsOf(run),
    addAssessment,
    editAssessment,
    removeAssessment,
    next: nextStamp(run),
    error,
    warnings,
    blockers,
    canClose: canCloseLiveRun(run) && run.state !== LiveRunState.CLOSED,
    savedAt,
    replace,
  };
}
