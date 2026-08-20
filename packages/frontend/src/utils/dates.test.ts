import { describe, expect, it } from 'vitest';
import {
  addIsoDays,
  addMonths,
  dayOfMonth,
  formatDate,
  formatDateRange,
  formatDayLabel,
  formatMonthLabel,
  isoDateRange,
  isoMonth,
  monthEnd,
  monthGrid,
  monthStart,
  weekdayLabels,
} from './dates';

describe('isoDateRange', () => {
  it('is inclusive of both ends', () => {
    expect(isoDateRange('2026-10-03', '2026-10-05')).toEqual([
      '2026-10-03',
      '2026-10-04',
      '2026-10-05',
    ]);
  });

  it('is empty when the end precedes the start', () => {
    expect(isoDateRange('2026-10-05', '2026-10-01')).toEqual([]);
  });
});

describe('addIsoDays', () => {
  it('crosses month, year and DST boundaries without drifting', () => {
    expect(addIsoDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addIsoDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addIsoDays('2026-01-01', -1)).toBe('2025-12-31');
    // Europe/Lisbon leaves DST on 2026-10-25.
    expect(addIsoDays('2026-10-24', 2)).toBe('2026-10-26');
  });
});

describe('month helpers', () => {
  it('derives the month of a date', () => {
    expect(isoMonth('2026-10-05')).toBe('2026-10');
  });

  it('finds the first and last day of a month', () => {
    expect(monthStart('2026-10')).toBe('2026-10-01');
    expect(monthEnd('2026-10')).toBe('2026-10-31');
    expect(monthEnd('2026-09')).toBe('2026-09-30');
    expect(monthEnd('2026-02')).toBe('2026-02-28');
    expect(monthEnd('2028-02')).toBe('2028-02-29'); // leap year
  });

  it('steps months across year boundaries', () => {
    expect(addMonths('2026-10', 1)).toBe('2026-11');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-10', -3)).toBe('2026-07');
  });
});

describe('monthGrid', () => {
  it('starts on a Monday and always fills whole weeks', () => {
    for (const month of ['2026-01', '2026-02', '2026-09', '2026-10', '2028-02']) {
      const grid = monthGrid(month);
      expect(grid.length % 7).toBe(0);
      expect(new Date(`${grid[0]}T00:00:00.000Z`).getUTCDay()).toBe(1); // Monday
      expect(new Date(`${grid[grid.length - 1]}T00:00:00.000Z`).getUTCDay()).toBe(0); // Sunday
    }
  });

  it('covers the whole month, padded with neighbouring days', () => {
    // 2026-10-01 is a Thursday, 2026-10-31 a Saturday.
    const grid = monthGrid('2026-10');
    expect(grid[0]).toBe('2026-09-28');
    expect(grid[grid.length - 1]).toBe('2026-11-01');
    expect(grid).toContain('2026-10-01');
    expect(grid).toContain('2026-10-31');
  });

  it('needs no padding when a month starts on Monday and ends on Sunday', () => {
    // February 2027 runs Mon 1st → Sun 28th.
    const grid = monthGrid('2027-02');
    expect(grid[0]).toBe('2027-02-01');
    expect(grid[grid.length - 1]).toBe('2027-02-28');
    expect(grid).toHaveLength(28);
  });
});

describe('labels', () => {
  it('lists weekdays Monday-first, matching the calendar grid', () => {
    expect(weekdayLabels()).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  });

  it('formats a month, a day, a date and a range', () => {
    expect(formatMonthLabel('2026-10')).toBe('October 2026');
    expect(formatDayLabel('2026-09-28')).toBe('Mon, 28 Sep');
    expect(formatDate('2026-10-05')).toBe('5 Oct 2026');
    expect(formatDateRange('2026-09-28', '2026-10-05')).toBe('28 Sep 2026 – 5 Oct 2026');
  });

  it('reads the day of month in UTC, so late-evening dates do not slip', () => {
    expect(dayOfMonth('2026-10-01')).toBe(1);
    expect(dayOfMonth('2026-10-31')).toBe(31);
  });
});
