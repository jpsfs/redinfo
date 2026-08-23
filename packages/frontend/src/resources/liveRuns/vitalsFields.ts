import {
  ABCDE_BANDS,
  AbcdeBand,
  AssessmentInput,
  VITALS_PLAUSIBLE,
  VITALS_RANGES,
  VitalKey,
} from '@redinfo/shared';

/**
 * How each vital is *presented* — which band it belongs to, and what kind of
 * control it deserves.
 *
 * A table rather than markup because the control follows the value's shape, and
 * that is a fact about the measurement rather than a layout decision. Glasgow is
 * a bounded 3–15 scale nobody types; pain is eleven taps; the rest are numbers
 * with a unit. Getting that from a table means the assessment screen has no
 * `switch` in it, and adding a tenth vital is one row here.
 */

export type VitalControl = 'number' | 'stepper' | 'chips';

export interface VitalField {
  key: VitalKey;
  band: AbcdeBand;
  /** Short enough for a label above a 44px field on a 360px screen. */
  label: string;
  unit: string;
  control: VitalControl;
  /** Hard bounds, from the one place they live. */
  min: number;
  max: number;
  decimals: 0 | 1;
  /**
   * `inputMode`, never `type="number"`.
   *
   * A pt-PT keyboard produces `36,8`, and `type="number"` silently turns that
   * into an empty `valueAsNumber` — the crew types a temperature, looks away,
   * and the field is blank. `text` + `inputMode` keeps the comma and lets us
   * parse it ourselves.
   */
  inputMode: 'numeric' | 'decimal';
}

/** The vitals of one band, in the order the primary survey walks them. */
export const VITAL_FIELDS: readonly VitalField[] = [
  field('spo2', AbcdeBand.A, 'SpO₂', 'number'),
  field('respiratoryRate', AbcdeBand.B, 'Freq. respiratória', 'number'),
  field('systolic', AbcdeBand.C, 'T.A. sistólica', 'number'),
  field('diastolic', AbcdeBand.C, 'T.A. diastólica', 'number'),
  field('heartRate', AbcdeBand.C, 'Freq. cardíaca', 'number'),
  field('glasgow', AbcdeBand.D, 'Escala de Glasgow', 'stepper'),
  field('bloodGlucose', AbcdeBand.D, 'Glicemia', 'number'),
  field('temperature', AbcdeBand.E, 'Temperatura', 'number'),
  field('painScore', AbcdeBand.E, 'Dor', 'chips'),
];

function field(
  key: VitalKey,
  band: AbcdeBand,
  label: string,
  control: VitalControl,
): VitalField {
  const range = VITALS_RANGES[key];
  return {
    key,
    band,
    label,
    unit: range.unit,
    control,
    min: range.min,
    max: range.max,
    decimals: range.decimals,
    inputMode: range.decimals === 0 ? 'numeric' : 'decimal',
  };
}

export function vitalsForBand(band: AbcdeBand): VitalField[] {
  return VITAL_FIELDS.filter((entry) => entry.band === band);
}

/** Every band, with its vitals — the assessment screen's whole outline. */
export function vitalBands(): Array<{ band: AbcdeBand; vitals: VitalField[] }> {
  return ABCDE_BANDS.map((band) => ({ band, vitals: vitalsForBand(band) }));
}

/**
 * A typed value, as a number — or null for "not measured".
 *
 * A comma is a decimal point. A pt-PT keyboard offers no other separator, and a
 * crew typing `36,8` means 36.8 rather than nothing at all.
 */
export function parseVital(raw: string): number | null {
  const text = raw.trim().replace(',', '.');
  if (text === '') return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/** A stored value back in the field, with the locale's own separator. */
export function formatVital(value: number | null | undefined, decimals: 0 | 1): string {
  if (value === null || value === undefined) return '';
  return decimals === 0 ? String(value) : value.toFixed(1).replace('.', ',');
}

/**
 * Whether a value is outside its hard bounds — the only thing that is an error.
 *
 * Distinct from `implausibleVitals`, which is advisory: 71% SpO₂ is a real
 * reading and has to be recordable, while 710% is a typo.
 */
export function isOutOfRange(key: VitalKey, value: number | null): boolean {
  if (value === null) return false;
  const range = VITALS_RANGES[key];
  return value < range.min || value > range.max;
}

/** Whether a value is worth an advisory caption. Never a block. */
export function isImplausible(key: VitalKey, value: number | null): boolean {
  if (value === null) return false;
  const range = VITALS_PLAUSIBLE[key];
  return value < range.min || value > range.max;
}

/**
 * Whether a band has anything recorded — the rail's completion dot.
 *
 * The ABCDE finding counts as well as the vitals: "we looked and it was normal"
 * is a real answer for a band with no number attached to it, and a dot that
 * ignored it would send the crew back to a band they had already done.
 */
export function bandHasContent(band: AbcdeBand, assessment: AssessmentInput | undefined, findings: Partial<Record<AbcdeBand, unknown>> | null | undefined): boolean {
  if (findings?.[band]) return true;
  if (!assessment) return false;
  return vitalsForBand(band).some((entry) => {
    const value = assessment[entry.key];
    return value !== null && value !== undefined;
  });
}
