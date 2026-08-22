/**
 * Full-timestamp helpers, for fields where the time of day matters (an
 * emergency's activation, arrival, and vitals) — unlike `dates.ts`, which is
 * calendar-date-only and deliberately UTC-midnight based.
 *
 * `<input type="datetime-local">` reads and writes "YYYY-MM-DDTHH:mm" in the
 * browser's own local time, with no timezone attached — so what the
 * operational types is the wall-clock time they meant, round-tripped through
 * `Date` the same way the rest of the app's native inputs already do.
 */
export function toDateTimeLocal(iso: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

export function fromDateTimeLocal(value: string): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}
