import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AssessmentInput,
  EventReportProblem,
  LiveRunBlockerCode,
  LiveRunCapture,
  LiveRunIdentity,
  LiveRunInput,
  LiveRunMaterialEntry,
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
  backedRun,
  correctedStamp,
  emptyRun,
  materialsOf,
  nextStamp,
  patchedCapture,
  patchedIdentity,
  patchedRun,
  stampedRun,
  withAssessment,
  withMaterialTap,
  withNewAssessment,
  withSupportAction,
  withoutAssessment,
  withoutMaterialTap,
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
  /** Undo the last stamp and step the run back one state. The overflow menu's "Voltar". */
  goBack: () => void;
  recordSupportAction: (kind: LiveRunSupportActionKind) => void;

  materials: LiveRunMaterialEntry[];
  /** A favourite tile or a resolved barcode scan — one entry, appended. */
  recordMaterialTap: (materialItemId: string) => void;
  /** Undoes a mis-tap before it reaches the report. */
  removeMaterialTap: (index: number) => void;

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
  /**
   * The draft report this run became, once closing has produced one — read
   * back from the device's own copy on load, so a run reopened after closing
   * (a reload, or the board's own-run link) knows it without a round trip.
   * `null` for a run still open.
   */
  reportId: string | null;
  /**
   * Replaces the whole document, after a sync or a close.
   *
   * `reportId` is the second half of what closing writes — passing both here
   * makes it one IndexedDB write instead of two racing ones (see `close`'s
   * own call site): the record and its `reportId` land together or not at
   * all, rather than whichever of two independent writes happens to finish
   * last deciding what the device remembers.
   */
  replace: (run: LiveRunInput, reportId?: string | null) => Promise<void>;
  /**
   * Writes a still-debounced `patchLater` to the device immediately, rather
   * than waiting out its timer.
   *
   * Closing reads the device's own copy to decide what to push to the
   * server (see `useLiveRunSync`'s `flush`) — a word typed a beat before the
   * crew taps "Terminar" must not be the one thing left behind in a timer
   * that never gets to fire.
   */
  flush: () => void;
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
  const [reportId, setReportId] = useState<string | null>(null);

  // The pending write, so a debounced patch that is still in flight when the
  // crew taps a stamp is flushed rather than lost.
  const pending = useRef<{ run: LiveRunInput; timer: ReturnType<typeof setTimeout> } | null>(null);

  const write = useCallback(async (next: LiveRunInput) => {
    const now = new Date();
    await saveRun(next, {}, now);
    await enqueue(next.id, next.revision, now);
    setSavedAt(now.toISOString());
  }, []);

  const flush = useCallback((): Promise<void> => {
    const outstanding = pending.current;
    if (!outstanding) return Promise.resolve();
    clearTimeout(outstanding.timer);
    pending.current = null;
    return write(outstanding.run);
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
        setReportId(stored.reportId ?? null);
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
  useEffect(
    () => () => {
      void flush();
    },
    [flush],
  );

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

  const goBack = useCallback(() => {
    // Same reasoning as `stamp`: undoing one is exactly as write-through as
    // making one.
    apply((current) => backedRun(current), true);
  }, [apply]);

  const recordSupportAction = useCallback(
    (kind: LiveRunSupportActionKind) =>
      apply((current) => withSupportAction(current, kind, new Date()), true),
    [apply],
  );

  const recordMaterialTap = useCallback(
    (materialItemId: string) =>
      // Write-through, same as a support action: a tap is a fact recorded the
      // instant it happens, not something a debounce can risk losing.
      apply((current) => withMaterialTap(current, materialItemId, new Date()), true),
    [apply],
  );

  const removeMaterialTap = useCallback(
    (index: number) => apply((current) => withoutMaterialTap(current, index), true),
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
    (next: LiveRunInput, nextReportId?: string | null): Promise<void> => {
      if (pending.current) clearTimeout(pending.current.timer);
      pending.current = null;
      setRun(next);
      // `undefined` (the sync merge's own call, `onMerged`) leaves whatever
      // `reportId` the device already knew about untouched — only `close`
      // passing one explicitly moves it.
      if (nextReportId !== undefined) setReportId(nextReportId);
      return saveRun(next, nextReportId !== undefined ? { reportId: nextReportId } : {}).then(
        () => setSavedAt(new Date().toISOString()),
      );
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
    goBack,
    recordSupportAction,
    materials: materialsOf(run),
    recordMaterialTap,
    removeMaterialTap,
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
    reportId,
    replace,
    flush,
  };
}
