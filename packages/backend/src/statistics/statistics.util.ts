import { BadRequestException } from '@nestjs/common';
import { addIsoDays, isIsoDate, parseIsoDate, toIsoDate } from '../utils/date.util';

const LISBON_TIME_ZONE = 'Europe/Lisbon';

/**
 * Defaults to the 12 months up to and including today when no range is
 * given — the same default the mockup opens on
 * (docs/plans/estatisticas-dashboards.md open question #3).
 */
export function resolveStatisticsRange(from?: string, to?: string): { from: string; to: string } {
  if (from !== undefined && !isIsoDate(from)) {
    throw new BadRequestException('"from" must be a valid date (YYYY-MM-DD).');
  }
  if (to !== undefined && !isIsoDate(to)) {
    throw new BadRequestException('"to" must be a valid date (YYYY-MM-DD).');
  }
  const resolvedTo = to ?? toIsoDate(new Date());
  const resolvedFrom = from ?? shiftMonths(resolvedTo, -11, true);
  if (resolvedFrom > resolvedTo) {
    throw new BadRequestException('"from" must not be after "to".');
  }
  return { from: resolvedFrom, to: resolvedTo };
}

/** The same-length window immediately before `[from, to]`, for year-over-year deltas. */
export function previousPeriodRange(from: string, to: string): { from: string; to: string } {
  const spanDays = daysBetween(from, to) + 1;
  const prevTo = addIsoDays(from, -1);
  const prevFrom = addIsoDays(prevTo, -(spanDays - 1));
  return { from: prevFrom, to: prevTo };
}

function daysBetween(from: string, to: string): number {
  return Math.round((parseIsoDate(to).getTime() - parseIsoDate(from).getTime()) / 86_400_000);
}

function shiftMonths(iso: string, delta: number, startOfMonth: boolean): string {
  const date = parseIsoDate(iso);
  date.setUTCMonth(date.getUTCMonth() + delta);
  if (startOfMonth) date.setUTCDate(1);
  return toIsoDate(date);
}

/** `YYYY-MM` for a `Date`, read in UTC — matches how `@db.Date` columns round-trip through Prisma. */
export function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

/** Every `YYYY-MM` from `from` to `to` inclusive, in order — the x-axis of every monthly chart. */
export function monthRange(from: string, to: string): string[] {
  const months: string[] = [];
  let cursor = `${from.slice(0, 7)}-01`;
  const end = `${to.slice(0, 7)}-01`;
  while (cursor <= end) {
    months.push(cursor.slice(0, 7));
    const date = parseIsoDate(cursor);
    date.setUTCMonth(date.getUTCMonth() + 1);
    cursor = toIsoDate(date);
  }
  return months;
}

/** Linear-interpolation percentile (Postgres `percentile_cont` semantics), 0 ≤ p ≤ 1. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (index - lo);
}

export function median(values: number[]): number | null {
  return percentile(values, 0.5);
}

/** Whole minutes between two instants, rounded to the nearest minute. */
export function diffMinutes(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 60_000);
}

/**
 * Weekday (0 = Sunday … 6 = Saturday, matching `Date#getDay()`) and 4-hour
 * band (0–5, each starting at `band * 4`) for a UTC instant, read in
 * `Europe/Lisbon` local time.
 *
 * The design doc's timezone trap: `activationAt`/`startedAt` are UTC
 * `DateTime` columns, and bucketing them without this conversion lands every
 * summer evening call an hour early. Read with `Intl` here (backend, not the
 * browser) rather than in raw SQL — same correctness, and keeps the bucketing
 * covered by a plain unit test instead of needing a live database.
 */
export function lisbonWeekdayAndBand(date: Date): { weekday: number; band: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: LISBON_TIME_ZONE,
    weekday: 'short',
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date);
  const weekdayStr = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
  const hourStr = parts.find((p) => p.type === 'hour')?.value ?? '0';
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekdayStr);
  const hour = Number(hourStr) % 24;
  return { weekday, band: Math.floor(hour / 4) };
}
