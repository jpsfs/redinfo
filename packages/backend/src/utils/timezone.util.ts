/**
 * Shift definitions are wall-clock and never change with the seasons — a
 * weekday shift starts at 20:00 whether it is January or July (see
 * `AvailabilityWindowShift`'s doc comment). What *does* change is the UTC
 * offset needed to compare that wall-clock boundary against a real instant —
 * an emergency report's own timestamp — since Portugal is WET (UTC+0) in
 * winter and WEST (UTC+1) in summer. Getting this wrong is a silent ~1h error
 * (see `EventReportCrewService.suggestCrew`, which accepts that error for a
 * crew *suggestion* a human still reviews); volunteer-hours exception
 * detection (#164) credits and flags minutes from it, so it resolves the
 * offset properly instead.
 */
export const DELEGATION_TIME_ZONE = 'Europe/Lisbon';

/**
 * The UTC offset in effect for a given calendar date, in minutes to *add* to
 * UTC to get local time (e.g. `60` for WEST). Resolved from noon on that date
 * so as to stay clear of the DST transition hour itself, which happens at
 * 1–2am local and is irrelevant to shifts that start at fixed clock times.
 */
function utcOffsetMinutes(isoDate: string, timeZone: string): number {
  const probe = new Date(`${isoDate}T12:00:00.000Z`);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset',
    hour: '2-digit',
  }).formatToParts(probe);
  const tzName = parts.find((part) => part.type === 'timeZoneName')?.value ?? 'GMT+0';
  const match = /GMT([+-]\d+)/.exec(tzName);
  return match ? Number(match[1]) * 60 : 0;
}

/**
 * A shift's wall-clock boundary — its own calendar date plus minutes from
 * midnight (`0`–`1440`, per `AvailabilityWindowShift.endMinute`) — as the
 * real instant it falls at, in `timeZone`. `1440` (midnight) correctly rolls
 * onto the next calendar date's UTC instant.
 */
export function shiftBoundaryToInstant(
  isoDate: string,
  minuteOfDay: number,
  timeZone = DELEGATION_TIME_ZONE,
): Date {
  const offsetMinutes = utcOffsetMinutes(isoDate, timeZone);
  const midnightUtc = new Date(`${isoDate}T00:00:00.000Z`);
  return new Date(midnightUtc.getTime() + minuteOfDay * 60_000 - offsetMinutes * 60_000);
}
