import { describe, expect, it } from 'vitest';
import {
  ApiErrorCode,
  AvailabilityWindowCategory,
  BloodType,
  CertificationType,
  EVENT_LOCATION_TYPES,
  EVENT_REPORT_TYPES,
  EventReportProblemCode,
  EventReportWarningCode,
  GENDERS,
  OCCURRENCE_TIME_FIELDS,
  UserRole,
  VictimDestinationKind,
} from '@redinfo/shared';
import englishMessages from 'ra-language-english';
import {
  accountRoleDescription,
  accountRoleLabel,
  apiErrorLabel,
  bloodTypeLabel,
  certificationLabel,
  destinationLabel,
  genderLabel,
  locationTypeLabel,
  messagesFor,
  occurrenceTimeLabel,
  problemLabel,
  reportTypeHint,
  reportTypeLabel,
  roleLabel,
  Translate,
  warningLabel,
  windowCategoryDescription,
  windowCategoryLabel,
} from './labels';
import raPortugueseMessages from './ra-pt';

// ── Every label the report screens need ────────────────────────────────────────
//
// The point of these: a value added to an enum without a label would otherwise
// reach a phone as a raw `SALOP_SUPPORT` on a button. Each enum is walked, so
// the gap shows up here instead. #180 moved the lookup out of a bare `t()` and
// into `messagesFor()` + react-admin's own `useTranslate()` (see `useT.ts`),
// but the point of these cases — no enum value silently falls through — is
// unchanged, so they are rewritten against the catalogue rather than deleted.

/** The fallback `t()` used to give a missing key: the key itself, unresolved. */
const translateFor =
  (locale: 'pt' | 'en'): Translate =>
  (key) =>
    messagesFor(locale)[key] ?? key;

const tPt = translateFor('pt');
const tEn = translateFor('en');

describe('the app catalogue', () => {
  it('gives every message both a Portuguese and an English value', () => {
    const pt = messagesFor('pt');
    const en = messagesFor('en');
    expect(Object.keys(pt)).toEqual(Object.keys(en));
    for (const key of Object.keys(pt)) {
      expect(pt[key], `pt/${key}`).toBeTruthy();
      expect(en[key], `en/${key}`).toBeTruthy();
    }
  });
});

describe('every enum value has a label', () => {
  it('covers report types, and their one-line hints', () => {
    for (const type of EVENT_REPORT_TYPES) {
      expect(reportTypeLabel(tPt, type)).not.toContain('reportType.');
      expect(reportTypeLabel(tPt, type).length).toBeGreaterThan(0);
      expect(reportTypeHint(tPt, type)).not.toContain('reportTypeHint.');
    }
  });

  it('covers location types', () => {
    for (const value of EVENT_LOCATION_TYPES) {
      expect(locationTypeLabel(tPt, value)).not.toContain('locationType.');
    }
  });

  it('covers genders', () => {
    for (const value of GENDERS) {
      expect(genderLabel(tPt, value)).not.toContain('gender.');
    }
  });

  it('covers every destination, transported or not', () => {
    for (const value of Object.values(VictimDestinationKind)) {
      expect(destinationLabel(tPt, value)).not.toContain('destination.');
    }
  });

  it('covers all five occurrence times', () => {
    for (const field of OCCURRENCE_TIME_FIELDS) {
      expect(occurrenceTimeLabel(tPt, field)).not.toContain('time.');
    }
  });

  it('covers every certification', () => {
    for (const type of Object.values(CertificationType)) {
      expect(certificationLabel(tPt, type)).not.toContain('certification.');
    }
  });

  it('covers every blood type', () => {
    for (const type of Object.values(BloodType)) {
      expect(bloodTypeLabel(tPt, type)).not.toContain('bloodType.');
    }
  });

  // #180 phase 2: moved out of `@redinfo/shared`'s `ROLE_METADATA`.
  it('covers every account role, with both a label and a description', () => {
    for (const role of Object.values(UserRole)) {
      expect(accountRoleLabel(tPt, role)).not.toContain('accountRole.');
      expect(accountRoleDescription(tPt, role)).not.toContain('accountRoleDescription.');
    }
  });

  // #180 phase 2: the frontend's own translated keys, over
  // `AVAILABILITY_WINDOW_CATEGORY_METADATA`'s English (kept in shared for the
  // backend's still-English overlap-exception message).
  it('covers every availability-window category, with both a label and a description', () => {
    for (const category of Object.values(AvailabilityWindowCategory)) {
      expect(windowCategoryLabel(tPt, category)).not.toContain('windowCategory.');
      expect(windowCategoryDescription(tPt, category)).not.toContain('windowCategoryDescription.');
    }
  });

  // #180 phase 4: the audited subset of ApiErrorCode that actually gets a
  // translation — see @redinfo/shared's doc comment on ApiErrorCode for why
  // this list is deliberately not exhaustive over the ~147 backend throws.
  const ALL_API_ERROR_CODES = [
    'WINDOW_OVERLAP_OPEN',
    'WINDOW_OVERLAP_CLOSED',
    'WINDOW_ALREADY_CLOSED',
    'SCHEDULE_DRAFT_NOT_VISIBLE',
    'SCHEDULE_ALREADY_EXISTS_FOR_WINDOW',
    'SCHEDULE_PUBLISHED_CANNOT_DELETE',
    'SCHEDULE_ALREADY_PUBLISHED',
    'ASSIGNMENT_PERSON_INACTIVE',
    'ASSIGNMENT_PERSON_NOT_FIELD_PERSONNEL',
    'ASSIGNMENT_CERTIFICATION_REQUIRED',
    'ASSIGNMENT_ALREADY_ON_SHIFT',
    'ASSIGNMENT_ROLE_FULL',
    'ASSIGNMENT_DATE_OUTSIDE_WINDOW',
    'ASSIGNMENT_WINDOW_HAS_NO_ROLES',
    'ASSIGNMENT_ROLE_ID_REQUIRED',
    'ASSIGNMENT_ROLE_NOT_IN_WINDOW',
    'SELF_ASSIGN_SCHEDULE_NOT_PUBLISHED',
    'SELF_ASSIGN_OVERLAPPING_SHIFT',
    'SHIFT_ADJUSTMENT_END_BEFORE_START',
    'SHIFT_ADJUSTMENT_OVERLAPS',
  ] as const satisfies readonly ApiErrorCode[];
  // If ApiErrorCode ever grows a member not listed above, this fails to
  // *compile* — the same trick as the EventReportProblemCode guard below.
  type MissingApiErrorCodes = Exclude<ApiErrorCode, (typeof ALL_API_ERROR_CODES)[number]>;
  const _apiErrorCodesAccountedFor: MissingApiErrorCodes extends never
    ? true
    : MissingApiErrorCodes = true;
  void _apiErrorCodesAccountedFor;

  it('translates every audited ApiErrorCode', () => {
    for (const code of ALL_API_ERROR_CODES) {
      const label = apiErrorLabel(tPt, { code, message: `fallback for ${code}` });
      expect(label, code).not.toBe(`fallback for ${code}`);
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it('interpolates params into the translated message', async () => {
    // `tPt` above is a plain key lookup with no %{…} substitution — real
    // interpolation is polyglot's job, so this exercises the real thing via
    // the same `messages()` assembly `i18nProvider.ts` uses.
    const polyglotI18nProvider = (await import('ra-i18n-polyglot')).default;
    const { messages } = await import('./i18nProvider');
    const provider = polyglotI18nProvider(messages, 'pt');
    const realTranslate = (key: string, options?: Record<string, unknown>) =>
      provider.translate(key, options);

    const label = apiErrorLabel(realTranslate, {
      code: 'ASSIGNMENT_ROLE_FULL',
      message: 'fallback',
      params: { role: 'Condutor', capacity: '2/2' },
    });
    expect(label).toBe('Condutor está completo neste turno (2/2). Remove alguém primeiro, ou usa outra função.');
  });

  it('falls back to the English message for a code with no catalogue entry', () => {
    expect(
      apiErrorLabel(tPt, { code: 'NOT_A_REAL_CODE' as ApiErrorCode, message: 'This exact sentence.' }),
    ).toBe('This exact sentence.');
  });

  it('falls back to the message when there is no code at all', () => {
    expect(apiErrorLabel(tPt, { message: 'A plain validation message.' })).toBe(
      'A plain validation message.',
    );
  });

  // `EventReportProblemCode`/`EventReportWarningCode` are string unions, not
  // runtime enums, so there is nothing to `Object.values()` — the lists below
  // are hand-copied from `@redinfo/shared`. `_exhaustive` is what keeps that
  // honest: if a code is ever added there and not here, this file fails to
  // *compile*, not just to test, which is what makes it a real guard rather
  // than a list someone has to remember to update.
  const ALL_PROBLEM_CODES = [
    'UNKNOWN_TYPE',
    'MISSING_DATE',
    'MISSING_START',
    'INVALID_END',
    'END_BEFORE_START',
    'MISSING_LOCATION_TYPE',
    'MISSING_LOCALITY',
    'MISSING_REFERENCE',
    'REFERENCE_TOO_LONG',
    'TIMES_NOT_FOR_TYPE',
    'INVALID_TIME',
    'TIMES_OUT_OF_ORDER',
    'CREW_NOT_A_LIST',
    'TOO_MANY_CREW',
    'CREW_MISSING_PERSON',
    'CREW_DUPLICATE',
    'ROLE_NAME_TOO_LONG',
    'VEHICLES_NOT_A_LIST',
    'TOO_MANY_VEHICLES',
    'VEHICLE_MISSING_ID',
    'VEHICLE_DUPLICATE',
    'KILOMETRES_INVALID',
    'VICTIMS_NOT_A_LIST',
    'TOO_MANY_VICTIMS',
    'VICTIM_GENDER_MISSING',
    'VICTIM_AGE_INVALID',
    'DESTINATION_INVALID',
    'DESTINATION_HOSPITAL_REQUIRED',
    'DESTINATION_HOSPITAL_NOT_ALLOWED',
    'NARRATIVE_TOO_LONG',
    'SHIFT_MISSING_SCHEDULE',
    'SHIFT_MISSING_DATE',
    'SHIFT_MISSING_SLOT',
    'CLINICAL_NOT_FOR_TYPE',
    'CHAMU_TOO_LONG',
    'ABCDE_UNKNOWN_BAND',
    'ABCDE_INVALID_STATUS',
    'ABCDE_NOTE_TOO_LONG',
    'ASSESSMENTS_NOT_A_LIST',
    'TOO_MANY_ASSESSMENTS',
    'ASSESSMENT_INVALID_TIME',
    'ASSESSMENT_EMPTY',
    'VITAL_OUT_OF_RANGE',
    'VITAL_NOT_WHOLE',
    'DIASTOLIC_ABOVE_SYSTOLIC',
    'ASSESSMENT_POSITION_TOO_LONG',
    'LIVE_RUN_MISSING_ID',
    'LIVE_RUN_INVALID_REVISION',
    'LIVE_RUN_UNKNOWN_STATE',
    'LIVE_RUN_MISSING_START',
    'LIVE_RUN_ADDRESS_TOO_LONG',
    'LIVE_RUN_NAME_TOO_LONG',
    'LIVE_RUN_INVALID_DATE_OF_BIRTH',
    'LIVE_RUN_INVALID_SNS',
    'LIVE_RUN_COMPLAINT_TOO_LONG',
    'LIVE_RUN_NOT_CLOSED',
  ] as const satisfies readonly EventReportProblemCode[];
  type MissingProblemCodes = Exclude<EventReportProblemCode, (typeof ALL_PROBLEM_CODES)[number]>;
  // If this line fails to compile, `MissingProblemCodes` names the gap.
  const _problemCodesComplete: MissingProblemCodes extends never ? true : MissingProblemCodes = true;
  void _problemCodesComplete;

  const ALL_WARNING_CODES = [
    'MISSING_END_TIME',
    'MISSING_NARRATIVE',
    'NO_CREW',
    'NO_VEHICLE',
    'NO_VICTIM',
    'NO_TIMES_MARKED',
  ] as const satisfies readonly EventReportWarningCode[];
  type MissingWarningCodes = Exclude<EventReportWarningCode, (typeof ALL_WARNING_CODES)[number]>;
  const _warningCodesComplete: MissingWarningCodes extends never ? true : MissingWarningCodes = true;
  void _warningCodesComplete;

  it('gives every report-validation problem a translated message, not the English fallback', () => {
    for (const code of ALL_PROBLEM_CODES) {
      const label = problemLabel(tPt, { code, message: `fallback for ${code}` });
      expect(label, code).not.toBe(`fallback for ${code}`);
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it('gives every "still unfinished" warning a translated message', () => {
    for (const code of ALL_WARNING_CODES) {
      expect(warningLabel(tPt, code)).not.toContain('warning.');
    }
  });
});

describe('the catalogue is locale-independent — nothing is left in the other language', () => {
  it('has an English value for every key a Portuguese case above exercised', () => {
    expect(tEn('action.save')).toBe('Save report');
    expect(reportTypeLabel(tEn, 'LOCAL_SUPPORT')).toBe('Local Support');
    expect(destinationLabel(tEn, VictimDestinationKind.REFUSED_TRANSPORT)).toBe(
      'Refused transport',
    );
    expect(tEn('step.review')).toBe('Review');
    expect(tEn('status.draftSaved')).toBe('Saved');
  });
});

describe('crew posts', () => {
  it('translates the three standard posts', () => {
    expect(roleLabel(tPt, 'Driver')).toBe('Condutor');
    expect(roleLabel(tPt, 'Team Leader')).toBe('Chefe de Equipa');
    expect(roleLabel(tPt, 'Team Member')).toBe('Socorrista');
  });

  it('leaves a coordinator’s own role name exactly as they typed it', () => {
    // Roles belong to a window and may be called anything; inventing a
    // translation would be worse than showing what they wrote.
    expect(roleLabel(tPt, 'Apoio Extra')).toBe('Apoio Extra');
    expect(roleLabel(tPt, 'Piquete')).toBe('Piquete');
  });

  it('is empty for no role, rather than the word "null"', () => {
    expect(roleLabel(tPt, null)).toBe('');
    expect(roleLabel(tPt, undefined)).toBe('');
    expect(roleLabel(tPt, '')).toBe('');
  });
});

describe('a report problem with no translation on file', () => {
  it('falls back to the English message the rule carries', () => {
    // `problemLabel` is the one helper that is deliberately allowed to fall
    // through to English — see its doc comment in `labels.ts`.
    const label = problemLabel(tPt, {
      code: 'NOT_A_REAL_CODE' as EventReportProblemCode,
      message: 'This exact English sentence.',
    });
    expect(label).toBe('This exact English sentence.');
  });

  it('is empty for no problem at all', () => {
    expect(problemLabel(tPt, null)).toBe('');
  });
});

describe('an unrecognised key', () => {
  it('has no entry in either locale — resolving it is react-admin/polyglot’s fallback, not this module’s', () => {
    expect(messagesFor('pt')['nope.not.a.key']).toBeUndefined();
    expect(messagesFor('en')['nope.not.a.key']).toBeUndefined();
  });
});

// ── react-admin's own ~164 strings ─────────────────────────────────────────────
//
// The coverage guard that replaces trusting the eye: every leaf key in
// `ra-language-english` must have a counterpart in `ra-pt.ts`, or a key we
// missed would silently render English inside an otherwise-Portuguese screen.

function leafKeys(node: unknown, prefix = ''): string[] {
  if (typeof node === 'string') return [prefix];
  if (node && typeof node === 'object') {
    return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
      leafKeys(value, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [];
}

describe('ra-pt.ts', () => {
  it('translates every key ra-language-english defines', () => {
    const englishKeys = leafKeys(englishMessages).sort();
    const portugueseKeys = leafKeys(raPortugueseMessages).sort();
    expect(portugueseKeys).toEqual(englishKeys);
  });

  it('never leaves a phrase empty', () => {
    for (const key of leafKeys(raPortugueseMessages)) {
      const value = key
        .split('.')
        .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], raPortugueseMessages);
      expect(value, key).toBeTruthy();
    }
  });
});
