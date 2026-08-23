import { EventReport, totalKilometres, transportedVictimCount } from '@redinfo/shared';
import { destinationLabel, t } from '../../i18n/labels';

/**
 * One-line summaries shared between the report list (table and mobile
 * cards) and anywhere else a report is shown compactly. Kept separate from
 * `EventReportList.tsx` so `ReportListCard.tsx` can import them without a
 * circular dependency between the two.
 */

/** `1 · CHUC — Hospital Geral`, or `3 · 1 transportada`. */
export function victimSummary(report: EventReport): string {
  if (report.victims.length === 0) return '—';
  if (report.victims.length === 1) {
    const [victim] = report.victims;
    const where =
      victim.destinationHospital?.name ?? destinationLabel(victim.destinationKind);
    return `1 · ${where}`;
  }
  const transported = transportedVictimCount(report.victims);
  return `${report.victims.length} · ${transported}`;
}

/** `AA-12-BC · 42 km`, or `2 · 87 km` once there is more than one. */
export function vehicleSummary(report: EventReport): string {
  if (report.vehicles.length === 0) return '—';
  const kilometres = `${totalKilometres(report.vehicles)} ${t('field.kilometresShort')}`;
  if (report.vehicles.length === 1) {
    return `${report.vehicles[0].vehicle?.licensePlate ?? ''} · ${kilometres}`;
  }
  return `${report.vehicles.length} · ${kilometres}`;
}

export const crewSummary = (report: EventReport): string => {
  const names = report.crew
    .map((member) => member.user?.lastName)
    .filter((name): name is string => Boolean(name));
  if (names.length === 0) return '—';
  return names.length <= 2 ? names.join(' · ') : `${names.slice(0, 2).join(' · ')} · +${names.length - 2}`;
};
