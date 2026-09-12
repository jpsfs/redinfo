const DAYS_WARN = 30;

/** True once a date is within `DAYS_WARN` days of now, but not yet past — shared
 * between the desktop `Datagrid` chips and the mobile `VehicleCard`. */
export function isExpiringSoon(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  const target = new Date(dateStr);
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();
  return diffMs >= 0 && diffMs <= DAYS_WARN * 24 * 60 * 60 * 1000;
}

export function isOverdue(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}
