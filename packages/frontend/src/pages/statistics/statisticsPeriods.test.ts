import { describe, expect, it } from 'vitest';
import { resolveStatisticsPeriod } from './statisticsPeriods';

const TODAY = new Date(2026, 7, 28); // 28 Aug 2026, local time

describe('resolveStatisticsPeriod', () => {
  it('thisMonth spans the 1st to today', () => {
    expect(resolveStatisticsPeriod('thisMonth', TODAY)).toEqual({ from: '2026-08-01', to: '2026-08-28' });
  });

  it('thisYear spans Jan 1st to today', () => {
    expect(resolveStatisticsPeriod('thisYear', TODAY)).toEqual({ from: '2026-01-01', to: '2026-08-28' });
  });

  it('lastYear spans the full previous calendar year', () => {
    expect(resolveStatisticsPeriod('lastYear', TODAY)).toEqual({ from: '2025-01-01', to: '2025-12-31' });
  });

  it('last12Months spans the 1st of the month 11 months back to today', () => {
    expect(resolveStatisticsPeriod('last12Months', TODAY)).toEqual({ from: '2025-09-01', to: '2026-08-28' });
  });

  it('last12Months rolls the year back when the window crosses January', () => {
    expect(resolveStatisticsPeriod('last12Months', new Date(2026, 1, 15))).toEqual({
      from: '2025-03-01',
      to: '2026-02-15',
    });
  });
});
