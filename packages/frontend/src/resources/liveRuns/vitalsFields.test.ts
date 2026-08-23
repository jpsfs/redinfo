import { describe, expect, it } from 'vitest';
import { ABCDE_BANDS, AbcdeBand, VITALS_RANGES, VITAL_KEYS } from '@redinfo/shared';
import {
  VITAL_FIELDS,
  bandHasContent,
  formatVital,
  isImplausible,
  isOutOfRange,
  parseVital,
  vitalBands,
  vitalsForBand,
} from './vitalsFields';

describe('the presentation table', () => {
  it('places every vital in exactly one band', () => {
    const keys = VITAL_FIELDS.map((field) => field.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys].sort()).toEqual([...VITAL_KEYS].sort());
  });

  it('gives every band a place on the screen, even one with no numbers', () => {
    const bands = vitalBands().map((entry) => entry.band);
    expect(bands).toEqual([...ABCDE_BANDS]);
  });

  it('reads its bounds and units from the one place they live', () => {
    for (const field of VITAL_FIELDS) {
      const range = VITALS_RANGES[field.key];
      expect(field).toMatchObject({ min: range.min, max: range.max, unit: range.unit });
    }
  });

  it('never asks for a numeric keyboard where a decimal is expected', () => {
    // `inputMode` and not `type="number"`, and the mode has to match the
    // measurement: a temperature typed on a numeric-only pad cannot be 36,8.
    for (const field of VITAL_FIELDS) {
      expect(field.inputMode).toBe(field.decimals === 0 ? 'numeric' : 'decimal');
    }
  });

  it('gives the bounded scales their own controls', () => {
    // Nobody types a Glasgow score, and nobody types a pain score either — both
    // are one tap on a scale that has a fixed number of stops.
    expect(VITAL_FIELDS.find((field) => field.key === 'glasgow')?.control).toBe('stepper');
    expect(VITAL_FIELDS.find((field) => field.key === 'painScore')?.control).toBe('chips');
  });

  it('groups circulation’s three numbers together', () => {
    expect(vitalsForBand(AbcdeBand.C).map((field) => field.key)).toEqual([
      'systolic',
      'diastolic',
      'heartRate',
    ]);
  });
});

describe('parseVital', () => {
  it('reads a comma as a decimal point, because a pt-PT keyboard offers no other', () => {
    expect(parseVital('36,8')).toBe(36.8);
    expect(parseVital('36.8')).toBe(36.8);
  });

  it('is null for an empty field, which is "not measured"', () => {
    expect(parseVital('')).toBeNull();
    expect(parseVital('   ')).toBeNull();
  });

  it('is null rather than NaN for something that is not a number', () => {
    expect(parseVital('abc')).toBeNull();
    expect(parseVital('36,8,2')).toBeNull();
  });

  it('reads zero as a measurement, because asystole is a finding', () => {
    expect(parseVital('0')).toBe(0);
  });
});

describe('formatVital', () => {
  it('puts a stored value back with the separator the crew typed', () => {
    expect(formatVital(36.8, 1)).toBe('36,8');
    expect(formatVital(97, 0)).toBe('97');
  });

  it('renders an unmeasured value as an empty field, not a zero', () => {
    expect(formatVital(null, 0)).toBe('');
    expect(formatVital(undefined, 1)).toBe('');
  });

  it('round-trips through parseVital', () => {
    for (const value of [0, 15, 36.8, 128]) {
      const decimals = Number.isInteger(value) ? 0 : 1;
      expect(parseVital(formatVital(value, decimals as 0 | 1))).toBe(value);
    }
  });
});

describe('range checks', () => {
  it('accepts every bound and refuses one step past it', () => {
    for (const field of VITAL_FIELDS) {
      const step = field.decimals === 0 ? 1 : 0.1;
      expect(isOutOfRange(field.key, field.min)).toBe(false);
      expect(isOutOfRange(field.key, field.max)).toBe(false);
      expect(isOutOfRange(field.key, Number((field.min - step).toFixed(1)))).toBe(true);
      expect(isOutOfRange(field.key, Number((field.max + step).toFixed(1)))).toBe(true);
    }
  });

  it('treats an unmeasured value as neither wrong nor odd', () => {
    expect(isOutOfRange('spo2', null)).toBe(false);
    expect(isImplausible('spo2', null)).toBe(false);
  });

  it('flags an implausible reading without calling it invalid', () => {
    // A real SpO₂ of 71 has to be recordable — the whole point of writing a
    // vital down is that it is abnormal.
    expect(isImplausible('spo2', 71)).toBe(true);
    expect(isOutOfRange('spo2', 71)).toBe(false);
    expect(isImplausible('spo2', 97)).toBe(false);
  });
});

describe('bandHasContent — the rail’s completion dot', () => {
  it('is true once a vital in that band is measured', () => {
    expect(bandHasContent(AbcdeBand.A, { takenAt: 'x', spo2: 97 }, null)).toBe(true);
    expect(bandHasContent(AbcdeBand.B, { takenAt: 'x', spo2: 97 }, null)).toBe(false);
  });

  it('is true for a band the crew assessed but measured nothing in', () => {
    // "We looked and it was normal" is a real answer, and a dot that ignored it
    // would send the crew back to a band they had already done.
    expect(bandHasContent(AbcdeBand.E, undefined, { E: { status: 'NORMAL' } })).toBe(true);
  });

  it('counts a zero as measured', () => {
    expect(bandHasContent(AbcdeBand.C, { takenAt: 'x', heartRate: 0 }, null)).toBe(true);
  });

  it('is false for a band with nothing at all in it', () => {
    expect(bandHasContent(AbcdeBand.D, { takenAt: 'x' }, {})).toBe(false);
    expect(bandHasContent(AbcdeBand.D, undefined, null)).toBe(false);
  });
});
