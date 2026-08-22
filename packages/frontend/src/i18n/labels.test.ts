import { afterEach, describe, expect, it } from 'vitest';
import {
  EVENT_LOCATION_TYPES,
  EVENT_REPORT_TYPES,
  GENDERS,
  OCCURRENCE_TIME_FIELDS,
  VictimDestinationKind,
} from '@redinfo/shared';
import {
  destinationLabel,
  genderLabel,
  getLocale,
  locationTypeLabel,
  occurrenceTimeLabel,
  reportTypeHint,
  reportTypeLabel,
  roleLabel,
  setLocale,
  t,
} from './labels';

// ── Every label the report screens need ────────────────────────────────────────
//
// The point of these: a value added to an enum without a label would otherwise
// reach a phone as a raw `SALOP_SUPPORT` on a button. Each enum is walked, so
// the gap shows up here instead.

afterEach(() => setLocale('pt'));

describe('the default locale', () => {
  it('is Portuguese, because that is who fills reports in', () => {
    expect(getLocale()).toBe('pt');
    expect(t('action.save')).toBe('Gravar relatório');
  });
});

describe('every enum value has a label', () => {
  it('covers report types, and their one-line hints', () => {
    for (const type of EVENT_REPORT_TYPES) {
      expect(reportTypeLabel(type)).not.toContain('reportType.');
      expect(reportTypeLabel(type).length).toBeGreaterThan(0);
      expect(reportTypeHint(type)).not.toContain('reportTypeHint.');
    }
  });

  it('covers location types', () => {
    for (const value of EVENT_LOCATION_TYPES) {
      expect(locationTypeLabel(value)).not.toContain('locationType.');
    }
  });

  it('covers genders', () => {
    for (const value of GENDERS) {
      expect(genderLabel(value)).not.toContain('gender.');
    }
  });

  it('covers every destination, transported or not', () => {
    for (const value of Object.values(VictimDestinationKind)) {
      expect(destinationLabel(value)).not.toContain('destination.');
    }
  });

  it('covers all five occurrence times', () => {
    for (const field of OCCURRENCE_TIME_FIELDS) {
      expect(occurrenceTimeLabel(field)).not.toContain('time.');
    }
  });
});

describe('switching locale', () => {
  it('turns the whole map over', () => {
    setLocale('en');
    expect(t('action.save')).toBe('Save report');
    expect(reportTypeLabel('LOCAL_SUPPORT')).toBe('Local Support');
    expect(destinationLabel(VictimDestinationKind.REFUSED_TRANSPORT)).toBe(
      'Refused transport',
    );
  });

  it('is not a per-key decision — nothing is left in the other language', () => {
    setLocale('en');
    expect(t('step.review')).toBe('Review');
    expect(t('status.draftSaved')).toBe('Saved');
  });
});

describe('crew posts', () => {
  it('translates the three standard posts', () => {
    expect(roleLabel('Driver')).toBe('Condutor');
    expect(roleLabel('Team Leader')).toBe('Chefe de Equipa');
    expect(roleLabel('Team Member')).toBe('Socorrista');
  });

  it('leaves a coordinator’s own role name exactly as they typed it', () => {
    // Roles belong to a window and may be called anything; inventing a
    // translation would be worse than showing what they wrote.
    expect(roleLabel('Apoio Extra')).toBe('Apoio Extra');
    expect(roleLabel('Piquete')).toBe('Piquete');
  });

  it('is empty for no role, rather than the word "null"', () => {
    expect(roleLabel(null)).toBe('');
    expect(roleLabel(undefined)).toBe('');
    expect(roleLabel('')).toBe('');
  });
});

describe('an unknown key', () => {
  it('shows the key rather than a blank button', () => {
    // A blank label on a phone tells nobody anything; the key at least says
    // what is missing.
    expect(t('nope.not.a.key' as never)).toBe('nope.not.a.key');
  });
});
