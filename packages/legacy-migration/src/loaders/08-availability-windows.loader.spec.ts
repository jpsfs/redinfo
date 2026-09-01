import { isPlausibleLegacyMonth } from './08-availability-windows.loader';

describe('isPlausibleLegacyMonth', () => {
  const thisYear = new Date().getUTCFullYear();

  it('accepts a real year within the association’s history and every calendar month', () => {
    for (let mes = 1; mes <= 12; mes += 1) {
      expect(isPlausibleLegacyMonth(2018, mes)).toBe(true);
    }
  });

  it('accepts the current year but rejects one year past it', () => {
    expect(isPlausibleLegacyMonth(thisYear, 1)).toBe(true);
    expect(isPlausibleLegacyMonth(thisYear + 1, 1)).toBe(false);
  });

  it('rejects ano 0 — the NULL-coerced-to-0 case that synthesised an 1899 window', () => {
    expect(isPlausibleLegacyMonth(0, 1)).toBe(false);
  });

  it('rejects a year before the plausible range', () => {
    expect(isPlausibleLegacyMonth(1899, 1)).toBe(false);
  });

  it('rejects a non-integer or out-of-range mes', () => {
    expect(isPlausibleLegacyMonth(2018, 0)).toBe(false);
    expect(isPlausibleLegacyMonth(2018, 13)).toBe(false);
    expect(isPlausibleLegacyMonth(2018, 1.5)).toBe(false);
  });
});
