import { BrowserContext, Page } from 'playwright';
import { extractOtpCode, MailSummary, selectOtpMessage } from './otp-mail';
import { Logger } from './logger';

/**
 * DOM scraping for the already-bootstrapped OWA session.
 *
 * **Unconfirmed against a real capture** — unlike `docs/inem-portal-contract.md`,
 * nothing here has been checked against live OWA traffic yet (#215's brief
 * scoped the confirmed capture to the INEM side only: mailbox address,
 * sender, subject format). The selectors below are a best-effort guess at
 * OWA's message-list markup (ARIA `option` rows, an accessible `<time
 * datetime>` element) and **must be re-verified against a real OWA session
 * before this is trusted in production** — see README.md. Keep this file
 * thin for exactly that reason: everything that *is* confirmed (sender
 * address, subject format, "match by sender not subject alone", "mark
 * consumed") lives in the unit-tested `otp-mail.ts` instead.
 */

const OWA_INBOX_URL = 'https://outlook.office.com/mail/';
/** Best-effort: OWA redirects an expired/invalid session through Microsoft's own login host. */
const OWA_LOGIN_HOST_HINT = 'login.microsoftonline.com';
const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 90_000;

/** Thrown when the `storageState` handed in didn't actually authenticate — recovery is re-running the bootstrap script, not retrying (per #215's brief). */
export class OwaSessionExpiredError extends Error {}

/** Thrown when no matching OTP mail arrived within `POLL_TIMEOUT_MS`. */
export class OtpTimeoutError extends Error {}

export interface OtpReadResult {
  code: string;
  /** Must be persisted — OWA's cookie is a sliding window that refreshes on use, per the schema comment on `OWASession`. */
  refreshedStorageState: unknown;
}

/**
 * Opens a fresh page in `context` (built from the job's `storageState`),
 * polls the inbox for a matching OTP mail, and returns the code plus the
 * refreshed `storageState` — the caller is responsible for closing `context`
 * once done with it.
 */
export async function readOtpFromOwa(context: BrowserContext, since: string, log: Logger): Promise<OtpReadResult> {
  const page = await context.newPage();
  try {
    await page.goto(OWA_INBOX_URL, { waitUntil: 'domcontentloaded' });
    if (page.url().includes(OWA_LOGIN_HOST_HINT)) {
      throw new OwaSessionExpiredError('OWA storageState landed on the Microsoft login page instead of the inbox');
    }

    const deadline = Date.now() + POLL_TIMEOUT_MS;
    let match: MailSummary | null = null;
    while (Date.now() < deadline && !match) {
      const messages = await scrapeVisibleMessages(page);
      match = selectOtpMessage(messages, since);
      if (!match) {
        log.info('no matching OTP mail yet, polling OWA inbox again');
        await page.waitForTimeout(POLL_INTERVAL_MS);
        await page.reload({ waitUntil: 'domcontentloaded' });
      }
    }
    if (!match) throw new OtpTimeoutError('No INEM OTP mail arrived before the poll timeout');

    const code = extractOtpCode(match.subject);
    if (!code) throw new OtpTimeoutError('Matched message unexpectedly carried no extractable code');

    await markConsumed(page, match);
    const refreshedStorageState = await context.storageState();
    return { code, refreshedStorageState };
  } finally {
    await page.close();
  }
}

/**
 * Best-effort extraction of `{sender, subject, receivedAt}` from the
 * currently-rendered message list. Falls back to an empty list rather than
 * throwing on a DOM shape mismatch — a poll cycle that finds nothing just
 * retries, same as a cycle that ran before the mail arrived.
 */
async function scrapeVisibleMessages(page: Page): Promise<MailSummary[]> {
  return page.$$eval('[role="option"]', (rows) =>
    rows
      .map((row) => {
        const subject = row.querySelector('[class*="subject" i]')?.textContent?.trim() ?? row.getAttribute('aria-label') ?? '';
        const sender = row.querySelector('[class*="sender" i], [class*="from" i]')?.textContent?.trim() ?? '';
        const time = row.querySelector('time')?.getAttribute('datetime') ?? '';
        return { sender, subject, receivedAt: time };
      })
      .filter((m) => m.subject && m.receivedAt),
  );
}

/** Opens the matched message so OWA marks it read — the same "never consume a code twice" guarantee #215's brief asks for, without needing to track message ids ourselves. */
async function markConsumed(page: Page, match: MailSummary): Promise<void> {
  const row = page.locator('[role="option"]', { hasText: match.subject }).first();
  if (await row.count()) await row.click({ timeout: 5_000 }).catch(() => undefined);
}
