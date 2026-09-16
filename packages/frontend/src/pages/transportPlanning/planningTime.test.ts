import { describe, expect, it } from 'vitest';
import {
  clockLabel,
  computeTimelineSpan,
  diffMinutes,
  durationLabel,
  fromDatetimeLocalValue,
  hourTicks,
  isoFromDateAndMinutes,
  minutesOfDay,
  minutesToX,
  scaleToWidth,
  snapMinutes,
  timelineWidth,
  toDatetimeLocalValue,
  xToMinutes,
} from './planningTime';

const DAY = { startMinutes: 6 * 60, endMinutes: 22 * 60 };

describe('computeTimelineSpan', () => {
  it('falls back to a nominal day when nothing at all is planned', () => {
    expect(computeTimelineSpan([])).toEqual({ startMinutes: 8 * 60, endMinutes: 20 * 60 });
  });

  it('fits the hours the day actually uses, rounded out to whole hours', () => {
    const span = computeTimelineSpan([
      '2026-09-15T07:20:00.000',
      '2026-09-15T09:10:00.000',
      '2026-09-15T16:40:00.000',
    ]);
    expect(span).toEqual({ startMinutes: 7 * 60, endMinutes: 17 * 60 });
  });

  it('never squeezes below the minimum span, however short the day', () => {
    const span = computeTimelineSpan(['2026-09-15T09:10:00.000', '2026-09-15T10:20:00.000']);
    expect(span.endMinutes - span.startMinutes).toBeGreaterThanOrEqual(6 * 60);
  });

  it('stays inside the day when widening would run off midnight', () => {
    const early = computeTimelineSpan(['2026-09-15T00:10:00.000', '2026-09-15T01:00:00.000']);
    expect(early.startMinutes).toBe(0);
    expect(early.endMinutes - early.startMinutes).toBeGreaterThanOrEqual(6 * 60);

    const late = computeTimelineSpan(['2026-09-15T23:10:00.000', '2026-09-15T23:50:00.000']);
    expect(late.endMinutes).toBe(24 * 60);
    expect(late.endMinutes - late.startMinutes).toBeGreaterThanOrEqual(6 * 60);
  });
});

describe('scaleToWidth', () => {
  it('fits the whole span into the available width at zoom 1, so the board cannot overflow', () => {
    const window = scaleToWidth(DAY, 1200, 1);
    expect(timelineWidth(window)).toBeCloseTo(1200);
  });

  it('multiplies the scale by the zoom step, which is what turns on the scroll', () => {
    expect(timelineWidth(scaleToWidth(DAY, 1200, 2))).toBeCloseTo(2400);
  });

  it('survives being measured before layout, rather than dividing by a zero width', () => {
    const window = scaleToWidth(DAY, 0, 1);
    expect(Number.isFinite(window.pixelsPerMinute)).toBe(true);
    expect(window.pixelsPerMinute).toBeGreaterThan(0);
  });
});

describe('minutesToX / xToMinutes', () => {
  it('round-trips a pixel position back to the same minute', () => {
    const window = scaleToWidth(DAY, 1200, 1);
    const x = minutesToX(9 * 60 + 30, window);
    expect(xToMinutes(x, window)).toBeCloseTo(9 * 60 + 30);
  });

  it('puts the start of the span at x = 0', () => {
    expect(minutesToX(DAY.startMinutes, scaleToWidth(DAY, 1200, 1))).toBe(0);
  });
});

describe('hourTicks', () => {
  it('labels every hour when there is room for the labels', () => {
    const ticks = hourTicks(scaleToWidth(DAY, 1600, 1));
    expect(ticks).toHaveLength(17); // 06:00 … 22:00 inclusive
    expect(ticks[0]).toEqual({ minutes: 360, label: '06:00', labelled: true });
    expect(ticks.every((tick) => tick.labelled)).toBe(true);
  });

  it('keeps every gridline but thins the labels out when the scale is tight', () => {
    const ticks = hourTicks(scaleToWidth(DAY, 400, 1));
    expect(ticks).toHaveLength(17);
    expect(ticks.filter((tick) => tick.labelled).length).toBeLessThan(ticks.length);
  });
});

describe('clockLabel', () => {
  it('formats minutes since midnight as a wall clock', () => {
    expect(clockLabel(8 * 60 + 5)).toBe('08:05');
    expect(clockLabel(0)).toBe('00:00');
  });
});

describe('durationLabel', () => {
  it('reads as a planner reads it', () => {
    expect(durationLabel(40)).toBe('40 min');
    expect(durationLabel(60)).toBe('1h');
    expect(durationLabel(85)).toBe('1h 25');
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
