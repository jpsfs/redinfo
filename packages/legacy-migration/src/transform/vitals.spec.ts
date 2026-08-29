import { isTodoReview } from '../mapping.config';
import { mapTemperature, transformVitals } from './vitals';

const allZero = { sistolica: 0, diastolica: 0, spo2: 0, dx: 0, temperatura: 0 };

describe('transformVitals', () => {
  it('all-zero input produces no assessment row at all', () => {
    expect(transformVitals(allZero)).toBeNull();
  });

  it('zero is missing for sistolica/diastolica/spo2/dx individually', () => {
    const result = transformVitals({ ...allZero, sistolica: 120 });
    expect(result).not.toBeNull();
    expect(result!.systolic).toBe(120);
    expect(result!.diastolic).toBeNull();
    expect(result!.spo2).toBeNull();
    expect(result!.bloodGlucose).toBeNull();
  });

  it('one present measurement is enough for a row to exist', () => {
    const result = transformVitals({ ...allZero, spo2: 96 });
    expect(result).not.toBeNull();
    expect(result!.spo2).toBe(96);
  });

  it('heartRate: 0 is preserved — asystole is a finding, exempt from the zero-is-missing rule', () => {
    const result = transformVitals({ ...allZero, heartRate: 0 });
    expect(result).not.toBeNull();
    expect(result!.heartRate).toBe(0);
  });

  it('an absent heartRate (no column in this source) stays null, not zero', () => {
    const result = transformVitals({ ...allZero, spo2: 96 });
    expect(result!.heartRate).toBeNull();
  });

  it('a non-zero temperature is a Q5 TodoReview, not a guessed scale', () => {
    const result = transformVitals({ ...allZero, temperatura: 368 });
    expect(result).not.toBeNull();
    expect(isTodoReview(result!.temperature)).toBe(true);
    expect((result!.temperature as { question: string }).question).toBe('Q5');
  });
});

describe('mapTemperature', () => {
  it('zero is "not measured"', () => {
    expect(mapTemperature(0)).toBeNull();
  });

  it('any non-zero value is gated on Q5', () => {
    expect(isTodoReview(mapTemperature(37))).toBe(true);
    expect(isTodoReview(mapTemperature(368))).toBe(true);
  });
});
