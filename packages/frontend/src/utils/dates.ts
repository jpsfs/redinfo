/**
 * Calendar-date helpers for the availability screens.
 *
 * Dates are ISO `YYYY-MM-DD` strings end to end (matching the API and the
 * `@db.Date` columns behind it) and every `Date` we build sits at UTC midnight,
 * so a browser in any timezone puts a shift on the same day the server does.
 */

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
 * which makes the calendar header shift between environments.
 */
const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const MONTH_ABBREVIATIONS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export function weekdayLabels(): string[] {
  return [...WEEKDAY_LABELS];
}

/** January … December, for a month picker. */
export function monthNames(): string[] {
  return [...MONTH_NAMES];
}

/** e.g. "October 2026". */
export function formatMonthLabel(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return `${MONTH_NAMES[monthNumber - 1]} ${year}`;
}

/** e.g. "Mon, 28 Sep". */
export function formatDayLabel(date: string): string {
  const parsed = parseIsoDate(date);
  const weekday = WEEKDAY_LABELS[(parsed.getUTCDay() + 6) % 7];
  return `${weekday}, ${parsed.getUTCDate()} ${MONTH_ABBREVIATIONS[parsed.getUTCMonth()]}`;
}

/** e.g. "28 Sep 2026". */
export function formatDate(date: string): string {
  const parsed = parseIsoDate(date);
  return `${parsed.getUTCDate()} ${MONTH_ABBREVIATIONS[parsed.getUTCMonth()]} ${parsed.getUTCFullYear()}`;
}

/** e.g. "28 Sep – 5 Oct 2026". */
export function formatDateRange(from: string, to: string): string {
  return `${formatDate(from)} – ${formatDate(to)}`;
}

/** Day-of-month, for calendar cells. */
export function dayOfMonth(date: string): number {
  return parseIsoDate(date).getUTCDate();
}
