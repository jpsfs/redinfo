export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Date handling for `@db.Date` columns.
 *
 * Every calendar date crossing the API boundary is an ISO `YYYY-MM-DD` string,
 * compared and sorted lexicographically. `Date` objects are only ever created
 * at UTC midnight (`parseIsoDate`), which is what Postgres `DATE` round-trips
 * through Prisma — so no timezone can shift a shift onto the wrong day.
 */

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** True for a well-formed, real calendar date in `YYYY-MM-DD` form. */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE_REGEX.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  // Rejects overflow like 2026-02-30, which Date silently rolls over.
  return toIsoDate(parsed) === value;
}

/** `YYYY-MM-DD` → `Date` at UTC midnight. */
export function parseIsoDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** `Date` (or ISO string) → `YYYY-MM-DD`, always read in UTC. */
export function toIsoDate(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toISOString().slice(0, 10);
}

/** Day of week in UTC: 0 = Sunday … 6 = Saturday. */
export function isoDayOfWeek(value: string): number {
  return parseIsoDate(value).getUTCDay();
}

/** True for Saturday or Sunday. */
export function isWeekendDate(value: string): boolean {
  const day = isoDayOfWeek(value);
  return day === 0 || day === 6;
}

/** `YYYY-MM-DD` shifted by `days`. */
export function addIsoDays(value: string, days: number): string {
  const date = parseIsoDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDate(date);
}

/** Every date from `from` to `to` inclusive; empty when `to` precedes `from`. */
export function isoDateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  let cursor = from;
  while (cursor <= to) {
    dates.push(cursor);
    cursor = addIsoDays(cursor, 1);
  }
  return dates;
}
