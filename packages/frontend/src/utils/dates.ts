/**
 * Calendar-date helpers for the availability screens.
 *
 * Dates are ISO `YYYY-MM-DD` strings end to end (matching the API and the
 * `@db.Date` columns behind it) and every `Date` we build sits at UTC midnight,
 * so a browser in any timezone puts a shift on the same day the server does.
 */
// Month names come from @redinfo/shared, which the backend also names an
// emergency window from — so the label and the name cannot disagree.
import { MONTH_NAMES } from '@redinfo/shared';
import type { Translate } from '../i18n/labels';

export function parseIsoDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function addIsoDays(value: string, days: number): string {
  const date = parseIsoDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDate(date);
}

/** Every date from `from` to `to` inclusive. */
export function isoDateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  let cursor = from;
  while (cursor <= to && dates.length < 400) {
    dates.push(cursor);
    cursor = addIsoDays(cursor, 1);
  }
  return dates;
}

/** `YYYY-MM` of an ISO date. */
export function isoMonth(value: string): string {
  return value.slice(0, 7);
}

/** First day of a `YYYY-MM` month. */
export function monthStart(month: string): string {
  return `${month}-01`;
}

/** Last day of a `YYYY-MM` month. */
export function monthEnd(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  // Day 0 of the next month is the last day of this one.
  return toIsoDate(new Date(Date.UTC(year, monthNumber, 0)));
}

export function addMonths(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return isoMonth(toIsoDate(shifted));
}

/**
 * The Monday-first calendar grid covering a whole month: always a multiple of
 * 7 days, padded with the trailing days of the previous month and the leading
 * days of the next.
 */
export function monthGrid(month: string): string[] {
  const first = monthStart(month);
  const last = monthEnd(month);
  // getUTCDay: 0 = Sunday. Shift so Monday is 0.
  const leading = (parseIsoDate(first).getUTCDay() + 6) % 7;
  const trailing = (7 - ((parseIsoDate(last).getUTCDay() + 6) % 7) - 1) % 7;
  return isoDateRange(addIsoDays(first, -leading), addIsoDays(last, trailing));
}

/**
 * Labels are spelled out rather than delegated to `toLocaleDateString`: ICU
 * abbreviations differ between browsers and Node versions ("Sep" vs "Sept"),
 * which makes the calendar header shift between environments — see
 * `i18n/labels.ts`'s "Calendar headers" section for the actual pt/en text.
 * `translate` is whatever `useT()` gives a component; these are read
 * through it rather than a bare lookup so the labels turn over with locale
 * (#180 phase 5) the same way every other translated string does.
 */
const WEEKDAY_KEYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;
const MONTH_KEYS = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
] as const;

export function weekdayLabels(t: Translate): string[] {
  return WEEKDAY_KEYS.map((key) => t(`date.weekday.${key}`));
}

/**
 * January … December, for `EmergencyWindowDialog`'s month picker —
 * deliberately the untranslated canonical list, not `i18n/labels.ts`'s
 * `date.monthFull.*`. This is the one place `MONTH_NAMES` is read on the
 * frontend for the *name* it produces, not for display: the option a
 * coordinator picks becomes part of the window's stored name (built from
 * this same array on the backend — see `MONTH_NAMES`'s doc comment in
 * `@redinfo/shared`), so translating it would show "Outubro" for a window
 * that is still named "... - October". If this function ever grows a
 * second, display-only caller, give that caller `formatMonthLabel`
 * instead rather than translating this one.
 */
export function monthNames(): string[] {
  return [...MONTH_NAMES];
}

/** e.g. "October 2026" — display only; see `monthNames()` for the naming picker. */
export function formatMonthLabel(t: Translate, month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return `${t(`date.monthFull.${MONTH_KEYS[monthNumber - 1]}`)} ${year}`;
}

/** The month abbreviation alone, 0-indexed (`Date.getUTCMonth()`'s convention). */
export function monthAbbreviation(t: Translate, monthIndex0: number): string {
  return t(`date.monthAbbr.${MONTH_KEYS[monthIndex0]}`);
}

/** e.g. "Mon, 28 Sep" (or the pt/en equivalent). */
export function formatDayLabel(t: Translate, date: string): string {
  const parsed = parseIsoDate(date);
  const weekday = t(`date.weekday.${WEEKDAY_KEYS[(parsed.getUTCDay() + 6) % 7]}`);
  const month = t(`date.monthAbbr.${MONTH_KEYS[parsed.getUTCMonth()]}`);
  return `${weekday}, ${parsed.getUTCDate()} ${month}`;
}

/** e.g. "28 Sep 2026" (or the pt/en equivalent). */
export function formatDate(t: Translate, date: string): string {
  const parsed = parseIsoDate(date);
  const month = t(`date.monthAbbr.${MONTH_KEYS[parsed.getUTCMonth()]}`);
  return `${parsed.getUTCDate()} ${month} ${parsed.getUTCFullYear()}`;
}

/** e.g. "28 Sep – 5 Oct 2026" (or the pt/en equivalent). */
export function formatDateRange(t: Translate, from: string, to: string): string {
  return `${formatDate(t, from)} – ${formatDate(t, to)}`;
}

/** Day-of-month, for calendar cells. */
export function dayOfMonth(date: string): number {
  return parseIsoDate(date).getUTCDate();
}
