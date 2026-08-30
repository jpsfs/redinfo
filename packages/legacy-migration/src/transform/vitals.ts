/**
 * `avaliacoes_saida` (0 rows in the live dump today — see plan §10 Q5) →
 * `EventReportAssessment`.
 *
 * Every legacy numeric column is `int(11) NOT NULL`, so `0` is legacy's own
 * "not measured" — confirmed for `sistolica`/`diastolica`/`spo2`/`dx` by
 * there being no other way to represent an unmeasured value in a NOT NULL
 * int column. `heartRate` is the deliberate exception: the model comment on
 * `EventReportAssessment` says `0` is a real finding (asystole), not a
 * missing one — there is no `heartRate` column in `avaliacoes_saida` today,
 * but this stays future-proof for a source that has one rather than baking
 * the zero-is-missing rule in everywhere.
 *
 * `temperatura` is the one field this module cannot resolve on its own:
 * legacy gives no unit, so `368` could be 36.8°C or a transcription of 368
 * degrees. With zero rows behind the question, there is nothing to measure
 * the assumption against — `mapTemperature` returns a `TodoReview` (Q5)
 * for any non-zero value rather than silently picking a scale.
 */
import { TodoReview, todoReview } from '../mapping.config';

export interface RawVitals {
  /** `int(11) NOT NULL`; `0` = not measured. */
  sistolica: number;
  diastolica: number;
  spo2: number;
  /** dx = capillary glucose → `bloodGlucose`. */
  dx: number;
  /** `int(11) NOT NULL`; `0` = not measured, pending Q5. */
  temperatura: number;
  /** No such column in `avaliacoes_saida` today — see the module doc. */
  heartRate?: number | null;
}

export interface TransformedVitals {
  systolic: number | null;
  diastolic: number | null;
  spo2: number | null;
  bloodGlucose: number | null;
  temperature: number | TodoReview | null;
  heartRate: number | null;
}

const zeroIsMissing = (value: number): number | null => (value === 0 ? null : value);

export function mapTemperature(rawTemperatura: number): number | TodoReview | null {
  if (rawTemperatura === 0) return null;
  return todoReview(
    'Q5',
    `Legacy temperatura=${rawTemperatura} has no known unit — whole degrees vs. tenths is undecided (0 rows to measure the assumption against).`,
  );
}

/** `null` when nothing at all was measured — `EventReportAssessment`'s own CHECK refuses an empty row. */
export function transformVitals(raw: RawVitals): TransformedVitals | null {
  const result: TransformedVitals = {
    systolic: zeroIsMissing(raw.sistolica),
    diastolic: zeroIsMissing(raw.diastolica),
    spo2: zeroIsMissing(raw.spo2),
    bloodGlucose: zeroIsMissing(raw.dx),
    temperature: mapTemperature(raw.temperatura),
    heartRate: raw.heartRate ?? null,
  };

  const nothingMeasured =
    result.systolic === null &&
    result.diastolic === null &&
    result.spo2 === null &&
    result.bloodGlucose === null &&
    result.temperature === null &&
    result.heartRate === null;

  return nothingMeasured ? null : result;
}
