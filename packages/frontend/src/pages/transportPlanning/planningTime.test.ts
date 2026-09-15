import { describe, expect, it } from 'vitest';
import {
  computeTimelineWindow,
  diffMinutes,
  fromDatetimeLocalValue,
  isoFromDateAndMinutes,
  minutesOfDay,
  minutesToX,
  snapMinutes,
  toDatetimeLocalValue,
  xToMinutes,
} from './planningTime';

describe('computeTimelineWindow', () => {
  it('falls back to the default 06:00–22:00 working day when nothing is out of range', () => {
    const window = computeTimelineWindow(['2026-09-15T08:00:00.000', '2026-09-15T18:00:00.000']);
    expect(window).toEqual({ startMinutes: 6 * 60, endMinutes: 22 * 60 });
  });

  it('widens to the nearest hour around anything planned outside the default window', () => {
    const window = computeTimelineWindow(['2026-09-15T05:15:00.000', '2026-09-15T23:40:00.000']);
    expect(window.startMinutes).toBe(5 * 60);
    expect(window.endMinutes).toBe(24 * 60);
  });
});

describe('minutesToX / xToMinutes', () => {
  const window = { startMinutes: 6 * 60, endMinutes: 22 * 60 };

  it('round-trips a pixel position back to the same minute', () => {
    const x = minutesToX(9 * 60 + 30, window);
    expect(xToMinutes(x, window)).toBeCloseTo(9 * 60 + 30);
  });
});

describe('snapMinutes', () => {
  it('rounds to the nearest 5 minutes', () => {
    expect(snapMinutes(482)).toBe(480);
    expect(snapMinutes(483)).toBe(485);
  });
});

describe('isoFromDateAndMinutes / minutesOfDay', () => {
  it('round-trips a date + minute offset back to the same minute of day', () => {
    const iso = isoFromDateAndMinutes('2026-09-15', 9 * 60 + 45);
    expect(minutesOfDay(iso)).toBe(9 * 60 + 45);
  });
});

describe('toDatetimeLocalValue / fromDatetimeLocalValue', () => {
  it('round-trips through the datetime-local string shape', () => {
    const iso = isoFromDateAndMinutes('2026-09-15', 14 * 60 + 5);
    const value = toDatetimeLocalValue(iso);
    expect(value).toMatch(/^2026-09-15T14:05$/);
    expect(fromDatetimeLocalValue(value)).toBe(iso);
  });
});

describe('diffMinutes', () => {
  it('computes the minute gap between two instants', () => {
    const start = isoFromDateAndMinutes('2026-09-15', 8 * 60);
    const end = isoFromDateAndMinutes('2026-09-15', 8 * 60 + 40);
    expect(diffMinutes(start, end)).toBe(40);
  });
});
