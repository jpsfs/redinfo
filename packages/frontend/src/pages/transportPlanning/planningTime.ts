/**
 * Time-axis math for `TransportPlanningPage`'s timeline lanes (#235) —
 * pure functions kept separate from rendering so the pixel/minute
 * conversions can be reasoned about (and tested) without a DOM.
 *
 * Works in the browser's own local time throughout, the same as any other
 * `Date`-based field in this app — a delegation coordinator's browser is
 * set to Europe/Lisbon, which is what the backend's own `shiftBoundaryToInstant`
 * assumes too, so wall-clock reads line up on both sides.
 *
 * The scale is carried *in* the window rather than being a module constant.
 * A fixed pixels-per-minute is what made the first version of this board
 * render a ~2300px strip that escaped its scroll container and dragged the
 * whole page sideways; deriving the scale from the width actually available
 * means the default view cannot overflow by construction, and zooming in is
 * an explicit choice that turns on a properly clipped scroll.
 */

/** Dragging always lands on a five-minute boundary — fine enough for
 * planning, coarse enough that a drop reliably lands on a sane time. */
export const SNAP_MINUTES = 5;

/** What the axis shows on a day with nothing planned at all. */
const EMPTY_DAY_START_MINUTES = 8 * 60;
const EMPTY_DAY_END_MINUTES = 20 * 60;

/** Never squeeze the axis below this, however short the day — a two-hour
 * board makes five minutes look like a meaningful distance. */
const MIN_SPAN_MINUTES = 6 * 60;

/** Below this, an hour is too narrow to label and the ruler thins itself out
 * to every second or third hour instead of overprinting. */
const MIN_PIXELS_PER_HOUR_FOR_EVERY_HOUR = 56;

/** Zoom steps the toolbar offers. `1` is fit-to-width: the whole planned day
 * is visible and the board does not scroll at all. */
export const ZOOM_STEPS = [1, 1.5, 2, 3, 4] as const;

export interface TimelineWindow {
  startMinutes: number;
  endMinutes: number;
  /** How many horizontal pixels one minute occupies at the current zoom. */
  pixelsPerMinute: number;
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

/** `1h 25` / `40 min` — a duration as a planner reads it, not as milliseconds. */
export function durationLabel(minutes: number): string {
  const whole = Math.max(0, Math.round(minutes));
  if (whole < 60) return `${whole} min`;
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${String(rest).padStart(2, '0')}`;
}

/**
 * The span the timeline covers, in minutes since local midnight: the hours the
 * day actually uses, rounded out to whole hours, never narrower than
 * `MIN_SPAN_MINUTES`.
 *
 * Fitted to the day rather than fixed at a nominal working day, because the
 * scale is what makes a block readable: a delegation whose work runs 07:00 to
 * 10:00 spent three quarters of a fixed 06:00–22:00 axis on empty afternoon,
 * and squeezed every leg into a few unreadable pixels to do it.
 *
 * Callers must pass the times of *unassigned* legs too, not just the stops
 * already on the board. Otherwise the axis would jump every time a leg was
 * dragged on — the one moment a planner most needs the board to hold still.
 */
export function computeTimelineSpan(allTimesIso: string[]): { startMinutes: number; endMinutes: number } {
  const minutes = allTimesIso.map(minutesOfDay).filter((m) => Number.isFinite(m));
  if (minutes.length === 0) {
    return { startMinutes: EMPTY_DAY_START_MINUTES, endMinutes: EMPTY_DAY_END_MINUTES };
  }

  let start = Math.floor(Math.min(...minutes) / 60) * 60;
  let end = Math.ceil(Math.max(...minutes) / 60) * 60;

  // Grow symmetrically to the minimum, then push back inside the day if that
  // ran off either end — a span is never allowed to leave 00:00–24:00.
  const shortfall = MIN_SPAN_MINUTES - (end - start);
  if (shortfall > 0) {
    start -= Math.ceil(shortfall / 2 / 60) * 60;
    end += Math.ceil(shortfall / 2 / 60) * 60;
  }
  if (start < 0) {
    end += -start;
    start = 0;
  }
  if (end > 24 * 60) {
    start = Math.max(0, start - (end - 24 * 60));
    end = 24 * 60;
  }
  return { startMinutes: start, endMinutes: end };
}

/**
 * Fits a span to the width actually available. At `zoom === 1` the whole span
 * maps exactly onto `availableWidth`, so the board never overflows; each step
 * above that multiplies the scale and the board's own scroll container takes
 * over.
 */
export function scaleToWidth(
  span: { startMinutes: number; endMinutes: number },
  availableWidth: number,
  zoom: number,
): TimelineWindow {
  const spanMinutes = Math.max(1, span.endMinutes - span.startMinutes);
  // A zero/negative width happens on the first render, before the board has
  // been measured. Fall back to something sane rather than dividing by it.
  const usableWidth = availableWidth > 0 ? availableWidth : spanMinutes;
  return { ...span, pixelsPerMinute: (usableWidth / spanMinutes) * zoom };
}

export function minutesToX(minutes: number, timelineWindow: TimelineWindow): number {
  return (minutes - timelineWindow.startMinutes) * timelineWindow.pixelsPerMinute;
}

export function xToMinutes(x: number, timelineWindow: TimelineWindow): number {
  return timelineWindow.startMinutes + x / timelineWindow.pixelsPerMinute;
}

/** Total width of the timeline track at the current scale. */
export function timelineWidth(timelineWindow: TimelineWindow): number {
  return minutesToX(timelineWindow.endMinutes, timelineWindow);
}

export function snapMinutes(minutes: number): number {
  return Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;
}

/** `HH:mm` for a minutes-since-midnight offset — for labelling the ruler and
 * the live drop indicator, neither of which has an ISO instant to hand. */
export function clockLabel(minutes: number): string {
  const wrapped = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

export interface HourTick {
  minutes: number;
  label: string;
  /** False when the hour is drawn as a gridline but left unlabelled, because
   * at this zoom the labels would collide. */
  labelled: boolean;
}

/**
 * One tick per hour across the span. Every hour gets a gridline; labels thin
 * out to every second or third hour when the scale is too tight to print them
 * all — a ruler whose numbers overlap is worse than one with fewer numbers.
 */
export function hourTicks(timelineWindow: TimelineWindow): HourTick[] {
  const pixelsPerHour = timelineWindow.pixelsPerMinute * 60;
  const everyNth =
    pixelsPerHour >= MIN_PIXELS_PER_HOUR_FOR_EVERY_HOUR
      ? 1
      : Math.ceil(MIN_PIXELS_PER_HOUR_FOR_EVERY_HOUR / Math.max(1, pixelsPerHour));
  const ticks: HourTick[] = [];
  const firstHour = Math.ceil(timelineWindow.startMinutes / 60);
  const lastHour = Math.floor(timelineWindow.endMinutes / 60);
  for (let hour = firstHour; hour <= lastHour; hour++) {
    ticks.push({ minutes: hour * 60, label: clockLabel(hour * 60), labelled: hour % everyNth === 0 });
  }
  return ticks;
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
