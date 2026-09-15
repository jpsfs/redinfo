/**
 * Time-axis math for `TransportPlanningPage`'s timeline lanes (#235) —
 * pure functions kept separate from rendering so the pixel/minute
 * conversions can be reasoned about (and tested) without a DOM.
 *
 * Works in the browser's own local time throughout, the same as any other
 * `Date`-based field in this app — a delegation coordinator's browser is
 * set to Europe/Lisbon, which is what the backend's own `shiftBoundaryToInstant`
 * assumes too, so wall-clock reads line up on both sides.
 */

/** How many horizontal pixels one minute of the day occupies — wide enough
 * that a five-minute drag increment (`SNAP_MINUTES`) is comfortably bigger
 * than a pointer's jitter. */
export const PIXELS_PER_MINUTE = 2.4;

/** Dragging always lands on a five-minute boundary — fine enough for
 * planning, coarse enough that a drop reliably lands on a sane time. */
export const SNAP_MINUTES = 5;

const DEFAULT_WINDOW_START_MINUTES = 6 * 60;
const DEFAULT_WINDOW_END_MINUTES = 22 * 60;

export interface TimelineWindow {
  startMinutes: number;
  endMinutes: number;
}

/** Minutes since local midnight for an ISO instant. */
export function minutesOfDay(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

/** `HH:mm`, in the browser's local time. */
export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * The window the timeline spans, in minutes since local midnight — the
 * default working day (06:00–22:00), widened to the nearest hour around
 * anything actually planned outside it rather than clipping it.
 */
export function computeTimelineWindow(allTimesIso: string[]): TimelineWindow {
  let start = DEFAULT_WINDOW_START_MINUTES;
  let end = DEFAULT_WINDOW_END_MINUTES;
  for (const iso of allTimesIso) {
    const m = minutesOfDay(iso);
    start = Math.min(start, Math.floor(m / 60) * 60);
    end = Math.max(end, Math.ceil(m / 60) * 60);
  }
  return { startMinutes: start, endMinutes: end };
}

export function minutesToX(minutes: number, timelineWindow: TimelineWindow): number {
  return (minutes - timelineWindow.startMinutes) * PIXELS_PER_MINUTE;
}

export function xToMinutes(x: number, timelineWindow: TimelineWindow): number {
  return timelineWindow.startMinutes + x / PIXELS_PER_MINUTE;
}

export function snapMinutes(minutes: number): number {
  return Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;
}

/** A local instant on `dateIso` (`YYYY-MM-DD`) at `minutes` since midnight —
 * the inverse of `minutesOfDay`, for turning a drop position back into a
 * planned time. */
export function isoFromDateAndMinutes(dateIso: string, minutes: number): string {
  const d = new Date(`${dateIso}T00:00:00`);
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString();
}

/** `<input type="datetime-local">` value for an ISO instant, in local time. */
export function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The inverse of `toDatetimeLocalValue`. */
export function fromDatetimeLocalValue(value: string): string {
  return new Date(value).toISOString();
}

/** Minutes between two ISO instants — the offset a reassignment drag must
 * preserve between a leg's pickup and dropoff. */
export function diffMinutes(fromIso: string, toIso: string): number {
  return Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60_000);
}
