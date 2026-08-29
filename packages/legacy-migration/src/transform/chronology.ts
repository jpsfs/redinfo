/**
 * `saidas.data` (DATE) + five `TIME` columns → the five UTC instants
 * `EventReport`'s emergency chronology holds, plus `startedAt`/`endedAt`.
 *
 * The trickiest transform in the harness, for two independent reasons:
 *
 * 1. **Midnight rollover.** All five times are clock times on one calendar
 *    date, but a run that starts at 23:40 and frees up at 00:55 is a perfectly
 *    ordinary night call, not a 22-hour inversion. Each field is walked in the
 *    Portuguese-abbreviation order the columns pair to
 *    (`h_chamada`→activation, `hcl`→scene arrival, `hsl`→scene departure,
 *    `hch`→hospital arrival, `hd`→available), skipping absent ones, and a day
 *    is added whenever the next *present* time is earlier in the day than the
 *    last present one.
 * 2. **Timezone.** Legacy stores wall-clock local time with no offset; this
 *    database stores UTC. `timezone` is a parameter (never a hard-coded
 *    constant) precisely so this file can be unit-tested across a DST
 *    boundary without touching the environment — `run-context.ts` is the only
 *    caller that reads `LEGACY_TIMEZONE`.
 *
 * MySQL's `TIME` type legally holds values outside 0–23 hours (up to
 * `838:59:59`); hours are read modulo 24 rather than assumed to already be a
 * valid hour-of-day, so a malformed extended value degrades to "some time on
 * this wall-clock day" instead of throwing.
 */
import { EventReportProblem, EventReportType, validateOccurrenceTimes } from '@redinfo/shared';

/** The five occurrence fields, in the fixed order they are walked. */
const CHRONOLOGY_FIELDS = [
  { legacy: 'hChamada', target: 'activationAt' },
  { legacy: 'hcl', target: 'sceneArrivalAt' },
  { legacy: 'hsl', target: 'sceneDepartureAt' },
  { legacy: 'hch', target: 'hospitalArrivalAt' },
  { legacy: 'hd', target: 'availableAt' },
] as const;

export interface ChronologyInput {
  /** `YYYY-MM-DD`. */
  data: string;
  /** `HH:MM:SS`-shaped strings (mysql2 with `dateStrings: true`). NOT NULL in legacy. */
  hChamada: string;
  hcl: string | null;
  hsl: string | null;
  hch: string | null;
  hd: string | null;
  /** IANA zone name, e.g. `Europe/Lisbon`. Never defaulted here — see the module doc. */
  timezone: string;
}

export interface ChronologyResult {
  occurredOn: string;
  activationAt: string;
  sceneArrivalAt: string | null;
  sceneDepartureAt: string | null;
  hospitalArrivalAt: string | null;
  availableAt: string | null;
  startedAt: string;
  endedAt: string | null;
}

export type ChronologyOutcome =
  | { ok: true; result: ChronologyResult }
  | { ok: false; problem: EventReportProblem };

/** Parses `HH:MM:SS` (or `H:MM:SS`, or an out-of-range hour) into seconds-of-day, mod 24h. */
function secondsOfDay(time: string): number {
  const [h, m, s] = time.split(':').map((part) => Number.parseInt(part, 10));
  const hours = ((h % 24) + 24) % 24;
  return hours * 3600 + (m || 0) * 60 + (s || 0);
}

/**
 * The UTC offset (minutes, positive = ahead of UTC) `timeZone` observes at the
 * instant `utcGuess`. Using `Intl.DateTimeFormat` rather than a date library
 * this backend has no dependency on — Node's ICU data is what actually knows
 * when Europe/Lisbon's clocks change.
 */
function offsetMinutesAt(timeZone: string, utcGuess: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
    .formatToParts(utcGuess)
    .reduce<Record<string, string>>((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === '24' ? '0' : parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return (asUtc - utcGuess.getTime()) / 60_000;
}

/**
 * A wall-clock `(YYYY-MM-DD, seconds-of-day)` in `timeZone` → the UTC instant
 * it names, as an ISO string. Two-pass: the first pass guesses the offset from
 * the naive "wall clock read as UTC" instant, the second recomputes it from
 * that result — the only case they disagree is a wall-clock time that fell
 * exactly in a DST transition, and the second pass is what settles it rather
 * than leaving an hour-sized error at the boundary.
 */
function wallClockToUtcInstant(isoDate: string, secondsIntoDay: number, timeZone: string): string {
  const guess = new Date(`${isoDate}T00:00:00.000Z`).getTime() + secondsIntoDay * 1000;
  const firstOffset = offsetMinutesAt(timeZone, new Date(guess));
  const refined = guess - firstOffset * 60_000;
  const secondOffset = offsetMinutesAt(timeZone, new Date(refined));
  return new Date(guess - secondOffset * 60_000).toISOString();
}

export function buildChronology(input: ChronologyInput): ChronologyOutcome {
  const raw: Record<string, string | null> = {
    hChamada: input.hChamada,
    hcl: input.hcl,
    hsl: input.hsl,
    hch: input.hch,
    hd: input.hd,
  };

  let dayOffset = 0;
  let lastSeconds: number | null = null;
  const instants: Record<string, string | null> = {};

  for (const field of CHRONOLOGY_FIELDS) {
    const value = raw[field.legacy];
    if (value === null || value === undefined || value === '') {
      instants[field.target] = null;
      continue;
    }
    const seconds = secondsOfDay(value);
    if (lastSeconds !== null && seconds < lastSeconds) dayOffset += 1;
    lastSeconds = seconds;

    const date = new Date(`${input.data}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + dayOffset);
    const dateForField = date.toISOString().slice(0, 10);

    instants[field.target] = wallClockToUtcInstant(dateForField, seconds, input.timezone);
  }

  const problem = validateOccurrenceTimes({
    type: EventReportType.EMERGENCY,
    activationAt: instants.activationAt,
    sceneArrivalAt: instants.sceneArrivalAt,
    sceneDepartureAt: instants.sceneDepartureAt,
    hospitalArrivalAt: instants.hospitalArrivalAt,
    availableAt: instants.availableAt,
  });
  if (problem) return { ok: false, problem };

  // NOT NULL in legacy, and the loop above always fills it when present.
  const activationAt = instants.activationAt as string;

  return {
    ok: true,
    result: {
      occurredOn: input.data,
      activationAt,
      sceneArrivalAt: instants.sceneArrivalAt,
      sceneDepartureAt: instants.sceneDepartureAt,
      hospitalArrivalAt: instants.hospitalArrivalAt,
      availableAt: instants.availableAt,
      startedAt: activationAt,
      endedAt: instants.availableAt,
    },
  };
}
