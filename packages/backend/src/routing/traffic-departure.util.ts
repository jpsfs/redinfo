import { TrafficDayType } from '@prisma/client';
import { DELEGATION_TIME_ZONE } from '../utils/timezone.util';

/**
 * Hour of departure in delegation-local time, 0–23 — `TrafficCorridorFactor`'s
 * `departureBucket`. Read with `Intl` (not the column's own UTC offset)
 * because Portugal's UTC offset itself changes with DST — see
 * `timezone.util.ts`'s doc comment for the same trap in `shiftBoundaryToInstant`.
 */
export function departureBucketFor(departAt: Date, timeZone = DELEGATION_TIME_ZONE): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(departAt);
  const hourStr = parts.find((part) => part.type === 'hour')?.value ?? '0';
  return Number(hourStr) % 24;
}

/** `departAt`'s own calendar date, in delegation-local time, as `YYYY-MM-DD` — for a holiday lookup. */
export function localIsoDateFor(departAt: Date, timeZone = DELEGATION_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(departAt);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * `TrafficCorridorFactor`'s `dayType` for a departure — `isHoliday` comes
 * from `HolidaysService`, since a calendar alone can't tell a holiday from
 * an ordinary weekday. A holiday always resolves `SUNDAY_HOLIDAY`
 * regardless of which weekday it actually lands on.
 */
export function trafficDayTypeFor(
  departAt: Date,
  isHoliday: boolean,
  timeZone = DELEGATION_TIME_ZONE,
): TrafficDayType {
  if (isHoliday) return TrafficDayType.SUNDAY_HOLIDAY;

  const parts = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).formatToParts(departAt);
  const weekday = parts.find((part) => part.type === 'weekday')?.value ?? 'Sun';
  if (weekday === 'Sun') return TrafficDayType.SUNDAY_HOLIDAY;
  if (weekday === 'Sat') return TrafficDayType.SATURDAY;
  return TrafficDayType.WEEKDAY;
}
