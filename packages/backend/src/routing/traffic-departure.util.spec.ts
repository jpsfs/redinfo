import { TrafficDayType } from '@prisma/client';
import { departureBucketFor, localIsoDateFor, trafficDayTypeFor } from './traffic-departure.util';

describe('departureBucketFor', () => {
  it('reads the hour in delegation-local time, not UTC', () => {
    // 2026-09-14 08:00 in Lisbon (WEST, UTC+1) is 07:00 UTC — a naive
    // `.getUTCHours()` would answer 7, not 8.
    const departAt = new Date('2026-09-14T07:00:00.000Z');
    expect(departureBucketFor(departAt)).toBe(8);
  });

  it('gives the same corridor a different bucket for a later departure', () => {
    const morning = departureBucketFor(new Date('2026-09-14T07:00:00.000Z')); // 08:00 local
    const late = departureBucketFor(new Date('2026-09-14T10:00:00.000Z')); // 11:00 local
    expect(morning).toBe(8);
    expect(late).toBe(11);
    expect(morning).not.toBe(late);
  });

  it('holds across the WET/WEST offset change (2026-01-14, WET, UTC+0)', () => {
    const departAt = new Date('2026-01-14T08:00:00.000Z');
    expect(departureBucketFor(departAt)).toBe(8);
  });
});

describe('localIsoDateFor', () => {
  it('rolls a late UTC instant onto the next local calendar date', () => {
    // 2026-09-14T23:30Z is already 2026-09-15 00:30 in Lisbon (WEST).
    expect(localIsoDateFor(new Date('2026-09-14T23:30:00.000Z'))).toBe('2026-09-15');
  });
});

describe('trafficDayTypeFor', () => {
  it('resolves WEEKDAY for an ordinary Monday', () => {
    const monday = new Date('2026-09-14T07:00:00.000Z'); // Monday, 08:00 local
    expect(trafficDayTypeFor(monday, false)).toBe(TrafficDayType.WEEKDAY);
  });

  it('resolves SATURDAY distinctly from a weekday', () => {
    const saturday = new Date('2026-09-19T10:00:00.000Z'); // Saturday, 11:00 local
    expect(trafficDayTypeFor(saturday, false)).toBe(TrafficDayType.SATURDAY);
  });

  it('resolves SUNDAY_HOLIDAY for an ordinary Sunday', () => {
    const sunday = new Date('2026-09-20T14:00:00.000Z'); // Sunday, 15:00 local
    expect(trafficDayTypeFor(sunday, false)).toBe(TrafficDayType.SUNDAY_HOLIDAY);
  });

  it('folds a holiday landing on a weekday into SUNDAY_HOLIDAY', () => {
    const wednesday = new Date('2026-09-16T08:00:00.000Z'); // Wednesday, 09:00 local
    expect(trafficDayTypeFor(wednesday, true)).toBe(TrafficDayType.SUNDAY_HOLIDAY);
  });
});
