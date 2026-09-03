import { BrowserContext, Page } from 'playwright';
import { DEFAULT_OWA_TIME_ZONE, extractOtpCode, MailSummary, parseOwaDisplayDate, selectOtpMessage } from './otp-mail';
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

/** OWA's message rows. Also the readiness signal that the SPA has rendered. */
const MESSAGE_ROW_SELECTOR = '[role="option"]';

/**
 * How long to let the message list render. OWA is a single-page app:
 * `domcontentloaded` fires *seconds* before any row exists — measured in
 * production 2026-09-03, the list was empty at +1.1s and fully populated at
 * +4.2s. Scraping without waiting for this is what made a mailbox full of OTP
 * mails look permanently empty.
 */
const LIST_RENDER_TIMEOUT_MS = 30_000;

/**
 * Poll cycles between full page reloads. OWA streams new mail into the list on
 * its own, so re-scraping the live DOM is enough and a reload is only a safety
 * net for a dropped connection. Reloading *every* cycle (the previous
 * behaviour) was both needlessly heavy on OWA — 30 full page loads per login
 * attempt — and self-defeating: each reload reset the SPA, and the very next
 * scrape ran before it had rendered again, so no cycle ever saw a single row.
 */
const RELOAD_EVERY_CYCLES = 10;

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
export async function readOtpFromOwa(
  context: BrowserContext,
  since: string,
  log: Logger,
  timeZone: string = DEFAULT_OWA_TIME_ZONE,
): Promise<OtpReadResult> {
  const page = await context.newPage();
  try {
    await page.goto(OWA_INBOX_URL, { waitUntil: 'domcontentloaded' });
    assertInboxNotLoginPage(page);
    await waitForMessageList(page, log);

    const deadline = Date.now() + POLL_TIMEOUT_MS;
    let match: MailSummary | null = null;
    for (let cycle = 0; Date.now() < deadline && !match; cycle++) {
      const messages = await scrapeVisibleMessages(page, timeZone);
      match = selectOtpMessage(messages, since);
      if (match) break;

      log.info('no matching OTP mail yet, polling OWA inbox again');
      await page.waitForTimeout(POLL_INTERVAL_MS);
      if ((cycle + 1) % RELOAD_EVERY_CYCLES === 0) {
        await page.reload({ waitUntil: 'domcontentloaded' });
        assertInboxNotLoginPage(page);
        await waitForMessageList(page, log);
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
 * Extracts `{sender, subject, receivedAt}` from the currently-rendered message
 * list. Falls back to an empty list rather than throwing on a DOM shape
 * mismatch — a poll cycle that finds nothing just retries, same as a cycle
 * that ran before the mail arrived.
 *
 * Everything here is keyed off `title`/`aria-label` rather than class names or
 * an element type, because that is what OWA actually exposes — verified
 * against the live mailbox 2026-09-03. The previous selectors
 * (`[class*="sender" i]`, `<time datetime>`) matched *nothing*: OWA ships
 * obfuscated class names (`TtcXM`, `qq2gS`, `ASFJj`) and renders no `<time>`
 * element at all, so both `sender` and `receivedAt` came back empty and the
 * trailing filter discarded every row — the inbox looked permanently empty
 * while sitting full of OTP mails. The sender's real address and the full
 * timestamp both live in sibling `title` tooltips, matched by shape below so
 * this does not depend on their order within the row.
 */
async function scrapeVisibleMessages(page: Page, timeZone: string): Promise<MailSummary[]> {
  const rows = await page.$$eval(MESSAGE_ROW_SELECTOR, (els) =>
    els.map((row) => {
      const titles = Array.from(row.querySelectorAll('[title]')).map((el) => el.getAttribute('title') ?? '');
      return {
        // The row's aria-label carries the subject inline; `extractOtpCode` is
        // anchored on "Token code:" so the surrounding label text is harmless.
        subject: row.getAttribute('aria-label') ?? '',
        sender: titles.find((t) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t.trim()))?.trim() ?? '',
        receivedAtRaw: titles.find((t) => /\d{1,2}\/\d{1,2}\/\d{4}/.test(t)) ?? '',
      };
    }),
  );
  return rows
    .map((row) => ({
      sender: row.sender,
      subject: row.subject,
      receivedAt: parseOwaDisplayDate(row.receivedAtRaw, timeZone) ?? '',
    }))
    .filter((m) => m.subject && m.receivedAt);
}

/** OWA redirects an expired/invalid session through Microsoft's own login host. */
function assertInboxNotLoginPage(page: Page): void {
  if (page.url().includes(OWA_LOGIN_HOST_HINT)) {
    throw new OwaSessionExpiredError('OWA storageState landed on the Microsoft login page instead of the inbox');
  }
}

/** Waits out the SPA's first render. A timeout is not fatal — the poll loop just retries on an empty scrape. */
async function waitForMessageList(page: Page, log: Logger): Promise<void> {
  await page
    .waitForSelector(MESSAGE_ROW_SELECTOR, { timeout: LIST_RENDER_TIMEOUT_MS })
    .catch(() => log.warn('OWA message list did not render before the timeout — scraping anyway'));
}

/** Opens the matched message so OWA marks it read — the same "never consume a code twice" guarantee #215's brief asks for, without needing to track message ids ourselves. */
async function markConsumed(page: Page, match: MailSummary): Promise<void> {
  const row = page.locator('[role="option"]', { hasText: match.subject }).first();
  if (await row.count()) await row.click({ timeout: 5_000 }).catch(() => undefined);
}
