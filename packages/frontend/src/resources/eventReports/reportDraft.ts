import {
  CHAMU_FIELDS,
  EventLocationType,
  EventReport,
  EventReportInput,
  EventReportType,
  OCCURRENCE_TIME_FIELDS,
  OccurrenceTimeField,
  eventReportRules,
} from '@redinfo/shared';

/**
 * The report form, as data — no React in here.
 *
 * Everything the wizard and the desktop form both need to agree on lives in
 * this file as plain functions: what an empty draft looks like, which steps a
 * type has, how a wall-clock time becomes an instant, and how a half-filled
 * report survives the app being closed. That keeps the hard parts testable
 * without rendering anything, and keeps the two form layouts from drifting.
 */

// ── Steps ─────────────────────────────────────────────────────────────────────

export type StepId =
  | 'whenWhere'
  | 'times'
  | 'crew'
  | 'vehicles'
  | 'victims'
  | 'clinical'
  | 'narrative'
  | 'review';

/**
 * The steps a report of this type has, in order.
 *
 * `times` is present only where the type has a chronology, which is what makes
 * an emergency seven steps and a support report six. Read from
 * `EVENT_REPORT_TYPE_RULES` rather than from an `=== EMERGENCY`, so a fourth
 * kind of activity would slot in without touching this function.
 */
export function stepsForType(type: EventReportType | string): StepId[] {
  const rules = eventReportRules(type);
  return [
    'whenWhere',
    ...(rules.hasOccurrenceTimes ? (['times'] as StepId[]) : []),
    'crew',
    'vehicles',
    'victims',
    // Present only where the type has a clinical record, which is what makes an
    // emergency eight steps and a support report six. ADO #151 removed vital
    // signs from the report; live mode puts them back, because the crew is now
    // recording them during the call and throwing them away at close would be
    // worse than not collecting them.
    ...(rules.hasClinicalRecord ? (['clinical'] as StepId[]) : []),
    'narrative',
    'review',
  ];
}

// ── Wall-clock times ──────────────────────────────────────────────────────────

const pad = (value: number) => String(value).padStart(2, '0');

/** `HH:MM` in the device's own timezone, or '' for an unmarked time. */
export function timeOfDay(instant?: string | null): string {
  if (!instant) return '';
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) return '';
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Today, as the device reckons it. */
export function todayIso(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * A wall-clock time on a given day, as an instant.
 *
 * `notBefore` is what makes a service that runs past midnight work: a crew that
 * started at 22:31 and finished at 00:14 means the small hours of the *next*
 * day, and typing "00:14" should not produce an end twenty-two hours before the
 * start. When the composed instant would precede `notBefore`, it rolls to the
 * following day.
 *
 * Built from local-time parts on purpose: the time on the screen is the time
 * the crew looked at, and `new Date(y, m, d, h, m)` is the only construction
 * that keeps it that way through a DST change.
 */
export function composeInstant(
  dateIso: string,
  time: string,
  options: { notBefore?: string | null } = {},
): string | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time?.trim() ?? '');
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateIso ?? '');
  if (!match || !dateMatch) return null;

  const [, hourText, minuteText] = match;
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (hour > 23 || minute > 59) return null;

  const [, year, month, day] = dateMatch.map(Number) as unknown as [
    string,
    number,
    number,
    number,
  ];

  const composed = new Date(year, month - 1, day, hour, minute, 0, 0);

  if (options.notBefore) {
    const floor = new Date(options.notBefore);
    if (!Number.isNaN(floor.getTime()) && composed.getTime() < floor.getTime()) {
      composed.setDate(composed.getDate() + 1);
    }
  }

  return composed.toISOString();
}

/** Minutes between two instants, or null when either is missing. */
export function minutesBetween(from?: string | null, to?: string | null): number | null {
  if (!from || !to) return null;
  const start = new Date(from).getTime();
  const end = new Date(to).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.round((end - start) / 60000);
}

// ── An empty draft ────────────────────────────────────────────────────────────

/**
 * A new report, pre-filled with what is knowable without asking: today's date
 * and the current time.
 *
 * The location type is not guessed. A wrong default that nobody notices is
 * worse than an unanswered question, and `HOME` would be right often enough to
 * stop being read.
 */
export function emptyDraft(type: EventReportType, now: Date = new Date()): EventReportInput {
  return {
    type,
    occurredOn: todayIso(now),
    startedAt: now.toISOString(),
    endedAt: null,
    externalReference: null,
    locationType: '' as EventLocationType,
    localityId: '',
    activationAt: null,
    sceneArrivalAt: null,
    sceneDepartureAt: null,
    hospitalArrivalAt: null,
    availableAt: null,
    shift: null,
    operationalReport: '',
    crew: [],
    vehicles: [],
    victims: [],
    chamuCircumstances: null,
    chamuHistory: null,
    chamuAllergies: null,
    chamuMedication: null,
    chamuLastMeal: null,
    abcde: null,
    assessments: [],
  };
}

/** A stored report, back in the shape the form edits. */
export function draftFromReport(report: EventReport): EventReportInput {
  return {
    type: report.type,
    occurredOn: report.occurredOn,
    startedAt: report.startedAt,
    endedAt: report.endedAt ?? null,
    externalReference: report.externalReference ?? null,
    locationType: report.locationType,
    localityId: report.localityId,
    activationAt: report.activationAt ?? null,
    sceneArrivalAt: report.sceneArrivalAt ?? null,
    sceneDepartureAt: report.sceneDepartureAt ?? null,
    hospitalArrivalAt: report.hospitalArrivalAt ?? null,
    availableAt: report.availableAt ?? null,
    shift: report.shift
      ? {
          scheduleId: report.shift.scheduleId,
          date: report.shift.date,
          slot: report.shift.slot,
        }
      : null,
    operationalReport: report.operationalReport,
    crew: report.crew.map((member) => ({
      userId: member.userId,
      roleName: member.roleName ?? null,
    })),
    vehicles: report.vehicles.map((vehicle) => ({
      vehicleId: vehicle.vehicleId,
      kilometres: vehicle.kilometres,
      // Carried, not recomputed: the legs are how "28 km" is explainable a year
      // later, and an edit that dropped them would silently turn a measurement
      // into a typed figure.
      routeLegs: vehicle.routeLegs ?? null,
      isOverridden: vehicle.isOverridden,
    })),
    victims: report.victims.map((victim) => ({
      gender: victim.gender,
      age: victim.age,
      destinationKind: victim.destinationKind,
      destinationHospitalId: victim.destinationHospitalId ?? null,
    })),
    // The clinical record travels with the report. Leaving it out here would
    // mean opening a report from a live run and saving it threw away every vital
    // the crew took — the save sends the whole document, so an absent field is a
    // deletion.
    ...Object.fromEntries(CHAMU_FIELDS.map((field) => [field, report[field] ?? null])),
    abcde: report.abcde ?? null,
    assessments: (report.assessments ?? []).map((assessment) => {
      const { id: _id, position: _position, ...rest } = assessment;
      return rest;
    }),
  };
}

/**
 * Drops the occurrence times a type cannot carry.
 *
 * Reached when someone starts an emergency report, stamps a couple of times,
 * then changes the type — without this the payload would carry timestamps the
 * API refuses, and the crew would see a validation error about a field the form
 * is no longer showing them.
 */
export function retypeDraft(
  draft: EventReportInput,
  type: EventReportType,
): EventReportInput {
  const next: EventReportInput = { ...draft, type };
  if (!eventReportRules(type).hasOccurrenceTimes) {
    for (const field of OCCURRENCE_TIME_FIELDS) {
      next[field as OccurrenceTimeField] = null;
    }
  }
  const rules = eventReportRules(type);
  // The same reasoning as the timestamps: a support report cannot carry a
  // clinical record, and leaving one on the payload would earn a validation
  // error about a field the form has stopped showing.
  if (!rules.hasClinicalRecord) {
    for (const field of CHAMU_FIELDS) next[field] = null;
    next.abcde = null;
    next.assessments = [];
  }
  return {
    ...next,
    // Trim rather than refuse: changing an event from a support job to an
    // emergency should not silently keep three vehicles the API will reject.
    vehicles: next.vehicles.slice(0, rules.maxVehicles),
    victims: next.victims.slice(0, rules.maxVictims),
  };
}

// ── Surviving a closed app ────────────────────────────────────────────────────

export const DRAFT_STORAGE_KEY = 'redinfo.eventReportDraft.v1';

export interface StoredDraft {
  draft: EventReportInput;
  /** When it was last written, so the resume card can say "yesterday at 21:04". */
  savedAt: string;
  /** Which step the crew had reached, so resuming does not start over. */
  stepId: StepId;
}

/**
 * The draft lives in `localStorage`, not on the server.
 *
 * A crew filling a report in is regularly out of coverage, so the only store
 * that can be relied on is the one in their hand. It also means an unfinished
 * report is nobody else's business until it is filed.
 *
 * Every entry point is guarded: private browsing, a full quota and a
 * half-written value all have to degrade to "no draft" rather than taking the
 * screen down with them.
 */
export function loadDraft(): StoredDraft | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDraft;
    // A draft with no type is not a draft; treat anything unrecognisable as
    // absent rather than feeding it to the form.
    if (!parsed?.draft?.type) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveDraft(draft: EventReportInput, stepId: StepId, now = new Date()): void {
  try {
    const payload: StoredDraft = { draft, stepId, savedAt: now.toISOString() };
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // A full quota must not stop someone finishing a report. The in-memory
    // state is still there; only the safety net is gone.
  }
}

export function clearDraft(): void {
  try {
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // Nothing to do, and nothing worth interrupting anyone for.
  }
}
