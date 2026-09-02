/**
 * OTP extraction from the OWA mailbox (docs/inem-portal-contract.md#the-otp-mail,
 * confirmed against a real message). Pure functions over a plain summary of
 * whatever `owa-reader.ts` scrapes out of the inbox DOM — kept separate so the
 * matching rules are unit-testable without a browser in sight.
 */

/** Sender address to filter on — never the subject alone (a lookalike "Token code:" mail is exactly the risk in a shared coordination mailbox). */
export const INEM_OTP_SENDER = 'noreply_inem@inem.pt';

export interface MailSummary {
  sender: string;
  subject: string;
  /** ISO 8601. */
  receivedAt: string;
}

/** Pulls the 6-digit code out of `Token code: <6 digits>` — it's in the subject in full, so the body never needs parsing. */
export function extractOtpCode(subject: string): string | null {
  const match = subject.match(/Token code:\s*(\d{6})(?!\d)/);
  return match ? match[1] : null;
}

/**
 * The newest message that is (a) from the confirmed INEM sender, (b) arrived
 * strictly after this login attempt started, and (c) actually carries a
 * 6-digit code in its subject. `since` excludes anything from a previous
 * attempt — reusing a stale code produces a failure that looks exactly like
 * a wrong password (per the contract doc), so this is a hard filter, not a
 * tie-breaker.
 */
export function selectOtpMessage(messages: MailSummary[], since: string): MailSummary | null {
  const sinceMs = Date.parse(since);
  const candidates = messages.filter(
    (m) => m.sender.toLowerCase() === INEM_OTP_SENDER && Date.parse(m.receivedAt) > sinceMs && extractOtpCode(m.subject) !== null,
  );
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt));
  return candidates[0];
}
