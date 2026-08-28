/**
 * Period presets for the statistics filter row (docs/plans/estatisticas-dashboards.md §7).
 * Pure date math — no fetch, no state — so it's covered without mounting anything.
 */
export type StatisticsPeriodPreset = 'thisMonth' | 'last12Months' | 'thisYear' | 'lastYear';

export const STATISTICS_PERIOD_PRESETS: readonly StatisticsPeriodPreset[] = [
  'thisMonth',
  'last12Months',
  'thisYear',
  'lastYear',
];

/** The mockup's own default (docs/plans/estatisticas-dashboards.md open question #3). */
export const DEFAULT_STATISTICS_PERIOD_PRESET: StatisticsPeriodPreset = 'last12Months';

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * `{from, to}` for a preset, read against `today` (local time — this is what
 * the person looking at the screen means by "today", not a UTC boundary).
 * `last12Months` mirrors the backend's own default range
 * (`resolveStatisticsRange`) so the preset chip and "no range given" agree.
 */
export function resolveStatisticsPeriod(
  preset: StatisticsPeriodPreset,
  today: Date = new Date(),
): { from: string; to: string } {
  const year = today.getFullYear();
  const month = today.getMonth() + 1; // 1-based
  const day = today.getDate();

  switch (preset) {
    case 'thisMonth':
      return { from: iso(year, month, 1), to: iso(year, month, day) };
    case 'thisYear':
      return { from: iso(year, 1, 1), to: iso(year, month, day) };
    case 'lastYear':
      return { from: iso(year - 1, 1, 1), to: iso(year - 1, 12, 31) };
    case 'last12Months': {
      let fromYear = year;
      let fromMonth = month - 11;
      if (fromMonth <= 0) {
        fromMonth += 12;
        fromYear -= 1;
      }
      return { from: iso(fromYear, fromMonth, 1), to: iso(year, month, day) };
    }
  }
}
