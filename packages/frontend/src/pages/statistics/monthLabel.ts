/** `"2026-08"` → a locale-formatted short month, e.g. "ago." / "Aug". */
export function formatMonthLabel(month: string, locale: string): string {
  const date = new Date(`${month}-01T00:00:00.000Z`);
  return new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(date);
}
