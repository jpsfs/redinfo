/**
 * OTP extraction from the OWA mailbox (docs/inem-portal-contract.md#the-otp-mail,
 * confirmed against a real message). Pure functions over a plain summary of
 * whatever `owa-reader.ts` scrapes out of the inbox DOM — kept separate so the
 * matching rules are unit-testable without a browser in sight.
 */

/** Sender address to filter on — never the subject alone (a lookalike "Token code:" mail is exactly the risk in a shared coordination mailbox). */
export const INEM_OTP_SENDER = 'noreply_inem@inem.pt';

/**
 * OWA renders the message list in the **mailbox's** timezone, not the
 * browser's — confirmed against production 2026-09-03, where a context
 * explicitly pinned to `UTC` still displayed Lisbon wall-clock times (a
 * 16:48Z mail showed as "17:48"). Setting Playwright's `timezoneId` therefore
 * does *not* help; the offset has to be applied here instead. Overridable via
 * `OWA_TIME_ZONE` for a mailbox configured to a different zone.
 */
export const DEFAULT_OWA_TIME_ZONE = 'Europe/Lisbon';

export interface MailSummary {
  sender: string;
  subject: string;
  /** ISO 8601. */
  receivedAt: string;
}

/**
 * Converts OWA's localized row tooltip (`"qui, 03/09/2026 17:48"`) into an ISO
 * instant.
 *
 * This exists because there is **no machine-readable timestamp on the row at
 * all** — verified 2026-09-03 by walking the whole `[role="option"]` subtree in
 * production: no `<time datetime>`, no epoch or ISO-valued attribute, nothing
 * but `title`/`aria-label` text. Day-before-month ordering follows the
 * mailbox's pt-PT locale (the same render that emits "Não lida"/"qui,"); a
 * mailbox switched to en-US would need this revisited, so the ordering is
 * asserted rather than guessed at where it can be.
 */
export function parseOwaDisplayDate(title: string, timeZone: string = DEFAULT_OWA_TIME_ZONE): string | null {
  const match = title.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})[,\s]+(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const [day, month, year, hour, minute] = match.slice(1, 6).map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  const utcMs = wallClockToUtcMs({ year, month, day, hour, minute }, timeZone);
  return Number.isNaN(utcMs) ? null : new Date(utcMs).toISOString();
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/**
 * Interprets a wall-clock reading as an instant in `timeZone`. Guesses that
 * the reading is UTC, measures how far off that lands in the target zone, then
 * corrects — twice, because near a DST transition the first offset can be
 * taken from the wrong side of the jump. Uses `Intl` rather than a date
 * library so DST is handled by the platform's own tz database.
 */
function wallClockToUtcMs(wall: WallClock, timeZone: string): number {
  const naive = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
  const firstPass = naive - zoneOffsetMs(naive, timeZone);
  return naive - zoneOffsetMs(firstPass, timeZone);
}

/** How far ahead of UTC `timeZone` is at the given instant, in ms. */
function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  // `hour12: false` renders midnight as "24" in some ICU builds.
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return asUtc - utcMs;
}

/** Pulls the 6-digit code out of `Token code: <6 digits>` — it's in the subject in full, so the body never needs parsing. */
export function extractOtpCode(subject: string): string | null {
  const match = subject.match(/Token code:\s*(\d{6})(?!\d)/);
  return match ? match[1] : null;
}

/**
 * The newest message that is (a) from the confirmed INEM sender, (b) arrived
 * no earlier than the minute this login attempt started, and (c) actually
 * carries a 6-digit code in its subject. `since` excludes anything from a
 * previous attempt — reusing a stale code produces a failure that looks
 * exactly like a wrong password (per the contract doc), so this is a hard
 * filter, not a tie-breaker.
 *
 * `since` is floored to the minute because OWA only renders minute
 * granularity (`"qui, 03/09/2026 17:48"` — no seconds). A strict `>` against a
 * second-precision `since` would discard the very mail it is waiting for
 * whenever the attempt starts and the mail lands inside the same minute — the
 * common case, since the mail is triggered *by* the credential submit. The
 * cost is a sub-60s window in which a mail from an immediately-preceding
 * attempt could still qualify; that is the deliberate trade, and it is the
 * safer side to err on than never matching at all.
 */
export function selectOtpMessage(messages: MailSummary[], since: string): MailSummary | null {
  const sinceMs = Math.floor(Date.parse(since) / 60_000) * 60_000;
  const candidates = messages.filter(
    (m) => m.sender.toLowerCase() === INEM_OTP_SENDER && Date.parse(m.receivedAt) >= sinceMs && extractOtpCode(m.subject) !== null,
  );
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt));
  return candidates[0];
}
