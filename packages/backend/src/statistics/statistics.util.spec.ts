import {
  diffMinutes,
  lisbonWeekdayAndBand,
  median,
  monthKey,
  monthRange,
  percentile,
  previousPeriodRange,
  resolveStatisticsRange,
} from './statistics.util';

describe('resolveStatisticsRange', () => {
  it('defaults to the 12 months up to and including today when nothing is given', () => {
    const today = new Date();
    const { from, to } = resolveStatisticsRange();
    expect(to).toBe(today.toISOString().slice(0, 10));
    expect(from.slice(8, 10)).toBe('01'); // first of the month, 11 months back
  });

  it('accepts an explicit range', () => {
    expect(resolveStatisticsRange('2026-01-01', '2026-06-30')).toEqual({
      from: '2026-01-01',
      to: '2026-06-30',
    });
  });

  it('rejects a malformed date', () => {
    expect(() => resolveStatisticsRange('not-a-date', '2026-06-30')).toThrow();
  });

  it('rejects a range where from is after to', () => {
    expect(() => resolveStatisticsRange('2026-06-30', '2026-01-01')).toThrow();
  });
});

describe('previousPeriodRange', () => {
  it('returns the same-length window immediately before the given range', () => {
    expect(previousPeriodRange('2026-02-01', '2026-02-28')).toEqual({
      from: '2026-01-04',
      to: '2026-01-31',
    });
  });

  it('handles a single-day range', () => {
    expect(previousPeriodRange('2026-03-15', '2026-03-15')).toEqual({
      from: '2026-03-14',
      to: '2026-03-14',
    });
  });
});

describe('monthKey / monthRange', () => {
  it('reads the month in UTC', () => {
    expect(monthKey(new Date('2026-08-31T23:00:00.000Z'))).toBe('2026-08');
  });

  it('lists every month between two dates inclusive', () => {
    expect(monthRange('2025-11-15', '2026-02-03')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });

  it('handles a range within a single month', () => {
    expect(monthRange('2026-05-01', '2026-05-31')).toEqual(['2026-05']);
  });
});

describe('percentile / median', () => {
  it('returns null for an empty array', () => {
    expect(median([])).toBeNull();
    expect(percentile([], 0.9)).toBeNull();
  });

  it('returns the single value for a one-element array', () => {
    expect(median([42])).toBe(42);
  });

  it('computes the median of an even-length array by interpolation', () => {
    expect(median([10, 20, 30, 40])).toBe(25);
  });

  it('computes p90 with linear interpolation, matching percentile_cont', () => {
    expect(percentile([10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 0.9)).toBe(91);
  });
});

describe('diffMinutes', () => {
  it('rounds to the nearest whole minute', () => {
    expect(diffMinutes(new Date('2026-06-01T10:00:00.000Z'), new Date('2026-06-01T10:11:40.000Z'))).toBe(12);
  });
});

describe('lisbonWeekdayAndBand', () => {
  it('reads a winter UTC instant as Lisbon standard time (UTC+0)', () => {
    // Monday 2026-01-05 08:30 UTC = 08:30 Lisbon in January.
    expect(lisbonWeekdayAndBand(new Date('2026-01-05T08:30:00.000Z'))).toEqual({ weekday: 1, band: 2 });
  });

  it('shifts a summer UTC instant forward one hour into Lisbon summer time (UTC+1)', () => {
    // Friday 2026-07-03 23:30 UTC is Saturday 00:30 in Lisbon (WEST) — both
    // the weekday and the band roll over, which is exactly the trap the
    // design doc calls out.
    expect(lisbonWeekdayAndBand(new Date('2026-07-03T23:30:00.000Z'))).toEqual({ weekday: 6, band: 0 });
  });
});
