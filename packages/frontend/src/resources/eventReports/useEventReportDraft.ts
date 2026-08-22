import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  EventReport,
  EventReportInput,
  EventReportProblem,
  EventReportType,
  EventReportWarningCode,
  eventReportWarnings,
  validateEventReport,
} from '@redinfo/shared';
import {
  StepId,
  clearDraft as clearStoredDraft,
  draftFromReport,
  emptyDraft,
  loadDraft,
  retypeDraft,
  saveDraft,
  stepsForType,
} from './reportDraft';

export interface UseEventReportDraftOptions {
  /** Editing a filed report, rather than starting one. */
  report?: EventReport | null;
  /** The kind of report being started. Ignored when `report` is given. */
  type?: EventReportType;
  /**
   * Pick up an unfinished draft from the device. Only for a new report: an edit
   * starts from what is stored on the server, and must not inherit somebody's
   * abandoned draft.
   */
  resume?: boolean;
}

export interface EventReportDraft {
  draft: EventReportInput;
  /** Merge changes in. Every field edit goes through here. */
  patch: (changes: Partial<EventReportInput>) => void;
  setType: (type: EventReportType) => void;

  steps: StepId[];
  stepId: StepId;
  stepIndex: number;
  isFirstStep: boolean;
  isLastStep: boolean;
  goTo: (step: StepId) => void;
  next: () => void;
  back: () => void;

  /**
   * Why this cannot be saved, or null. Blocks the save button.
   *
   * Carries a code as well as a sentence, so the screen can show the crew a
   * translated message rather than the API's English one.
   */
  error: EventReportProblem | null;
  /** What is unfinished, as codes the screen translates. Never blocking. */
  warnings: EventReportWarningCode[];
  canSave: boolean;

  /** When the draft was last written to the device, for the "Saved" pill. */
  savedAt: string | null;
  /** Forget the stored draft — after a successful save, or on discard. */
  forget: () => void;
}

/**
 * The report form's state.
 *
 * One hook behind both layouts: the phone wizard walks `steps` one at a time
 * and the desktop form shows them all at once, but neither owns any rule about
 * what a report is. That means the two cannot disagree, and the rules
 * themselves stay in `@redinfo/shared` where the API reads them too.
 *
 * Every change is written to the device. A crew filling a report in is
 * regularly out of coverage, and losing twenty minutes of typing to a phone
 * call is the failure this exists to prevent.
 */
export function useEventReportDraft(
  options: UseEventReportDraftOptions = {},
): EventReportDraft {
  const { report = null, type = EventReportType.EMERGENCY, resume = false } = options;

  // Resolved once: re-reading storage on every render would fight the user's
  // own edits, and an edit must never pick up a stale draft.
  const initial = useRef<{ draft: EventReportInput; stepId: StepId }>();
  if (!initial.current) {
    if (report) {
      initial.current = { draft: draftFromReport(report), stepId: 'whenWhere' };
    } else {
      const stored = resume ? loadDraft() : null;
      initial.current = stored
        ? { draft: stored.draft, stepId: stored.stepId }
        : { draft: emptyDraft(type), stepId: 'whenWhere' };
    }
  }

  const [draft, setDraft] = useState<EventReportInput>(initial.current.draft);
  const [stepId, setStepId] = useState<StepId>(initial.current.stepId);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const persist = report === null;

  const steps = useMemo(() => stepsForType(draft.type), [draft.type]);

  // A step that belonged to the old type — `times` on a report that has just
  // become a support job — would otherwise leave the wizard on a blank screen.
  const currentStep = steps.includes(stepId) ? stepId : steps[0];

  const stepIndex = steps.indexOf(currentStep);

  useEffect(() => {
    if (!persist) return;
    const now = new Date();
    saveDraft(draft, currentStep, now);
    setSavedAt(now.toISOString());
  }, [draft, currentStep, persist]);

  const patch = useCallback((changes: Partial<EventReportInput>) => {
    setDraft((current) => ({ ...current, ...changes }));
  }, []);

  const setType = useCallback((next: EventReportType) => {
    setDraft((current) => retypeDraft(current, next));
  }, []);

  const goTo = useCallback((step: StepId) => setStepId(step), []);

  const next = useCallback(() => {
    setStepId((current) => {
      const list = stepsForType(draft.type);
      const index = list.indexOf(current);
      return list[Math.min(index + 1, list.length - 1)] ?? current;
    });
  }, [draft.type]);

  const back = useCallback(() => {
    setStepId((current) => {
      const list = stepsForType(draft.type);
      const index = list.indexOf(current);
      return list[Math.max(index - 1, 0)] ?? current;
    });
  }, [draft.type]);

  const forget = useCallback(() => {
    clearStoredDraft();
    setSavedAt(null);
  }, []);

  const error = useMemo(() => validateEventReport(draft), [draft]);
  const warnings = useMemo(() => eventReportWarnings(draft), [draft]);

  return {
    draft,
    patch,
    setType,
    steps,
    stepId: currentStep,
    stepIndex,
    isFirstStep: stepIndex === 0,
    isLastStep: stepIndex === steps.length - 1,
    goTo,
    next,
    back,
    error,
    warnings,
    canSave: error === null,
    savedAt,
    forget,
  };
}
