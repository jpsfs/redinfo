import { chromium, Page } from 'playwright';
import { INEMLoginJob, INEMLoginJobResult } from '@redinfo/shared';
import { WorkerConfig } from './config';
import { detectPageKind } from './inem-forms';
import { Logger } from './logger';
import { OtpTimeoutError, OwaSessionExpiredError, readOtpFromOwa } from './owa-reader';

/**
 * Drives the confirmed 5-step cold-login flow
 * (docs/inem-portal-contract.md#cold-login--playwright-packagesinem-worker):
 * `/saml/signin` → credential form → OTP form (reading the code from the
 * bootstrapped OWA session) → the SAML auto-POST assertion page → `alAuth`.
 *
 * `alAuth`'s server-side TTL was never measured (see the contract doc's open
 * questions) — this assumes the one rolling window that *is* confirmed in
 * this system, `samlsessionid`'s 8h. Purely informational: nothing currently
 * reads `INEMSession.expiresAt` to gate behaviour.
 */
const ASSUMED_ALAUTH_LIFETIME_MS = 8 * 60 * 60 * 1000;

export async function runColdLogin(job: INEMLoginJob, config: WorkerConfig, log: Logger): Promise<INEMLoginJobResult> {
  const browser = await chromium.launch();
  try {
    const loginContext = await browser.newContext();
    const page = await loginContext.newPage();

    log.info('navigating to /saml/signin');
    await page.goto(`${config.inemBaseUrl}/saml/signin`, { waitUntil: 'domcontentloaded' });

    let kind = detectPageKind(await page.content());
    if (kind !== 'login') {
      return {
        ok: false,
        reason: 'unknown_error',
        message: `expected the FortiAuthenticator login page, got "${kind}" (${await pageDiagnostics(page)})`,
      };
    }

    log.info('submitting credentials');
    await page.fill('input[name="username"]', config.username);
    await page.fill('input[name="password"]', config.password);
    await submitCurrentForm(page);
    await page.waitForLoadState('domcontentloaded');

    kind = detectPageKind(await page.content());
    if (kind === 'login') {
      // Landing back on the same form after a credential submit is the one
      // scenario #215's brief calls out by name — the captcha input is
      // otherwise dormant markup on every normal login.
      return { ok: false, reason: 'captcha_challenge', message: 'Login form was returned again after credential submit' };
    }
    if (kind !== 'otp') {
      return {
        ok: false,
        reason: 'unknown_error',
        message: `expected the OTP page, got "${kind}" (${await pageDiagnostics(page)})`,
      };
    }

    log.info('reading the OTP from the bootstrapped OWA session');
    const owaContext = await browser.newContext({ storageState: job.storageState as never });
    let code: string;
    let refreshedStorageState: unknown;
    try {
      const otp = await readOtpFromOwa(owaContext, job.startedAt, log);
      code = otp.code;
      refreshedStorageState = otp.refreshedStorageState;
    } catch (err) {
      if (err instanceof OwaSessionExpiredError) return { ok: false, reason: 'owa_session_expired', message: err.message };
      if (err instanceof OtpTimeoutError) return { ok: false, reason: 'otp_timeout', message: err.message };
      throw err;
    } finally {
      await owaContext.close();
    }

    log.info('submitting the OTP');
    await page.fill('input[name="token_code"]', code);
    await submitCurrentForm(page);
    // The assertion page auto-submits itself to /saml/acs via its own
    // onload script — Playwright's real browser runs that JS, so this just
    // waits out the whole redirect chain rather than driving it by hand.
    await page
      .waitForURL((url) => url.pathname.includes('Dashboard'), { timeout: 30_000 })
      .catch(() => log.warn('did not observe a navigation to /Dashboard — checking cookies anyway'));

    const cookies = await loginContext.cookies();
    const alAuth = cookies.find((c) => c.name === 'alAuth')?.value;
    if (!alAuth) {
      return { ok: false, reason: 'unknown_error', message: 'Login flow completed but no alAuth cookie was set' };
    }
    const samlsessionid = cookies.find((c) => c.name === 'samlsessionid')?.value ?? null;
    const deviceId = cookies.find((c) => c.name === 'device_id')?.value ?? null;

    log.info('cold login succeeded');
    return {
      ok: true,
      cookies: { alAuth, samlsessionid, deviceId },
      expiresAt: new Date(Date.now() + ASSUMED_ALAUTH_LIFETIME_MS).toISOString(),
      refreshedStorageState,
    };
  } finally {
    await browser.close();
  }
}

/** Submits the page's first form via the DOM rather than clicking a guessed submit-button selector — the same auto-submit idiom the assertion page itself uses. */
async function submitCurrentForm(page: Page): Promise<void> {
  await page.locator('form').first().evaluate((form) => (form as HTMLFormElement).submit());
}

/**
 * A safe, non-secret fingerprint of "where did we actually land" for an
 * `unknown_error` result — the landed URL, the `<title>`, content length,
 * and whether a handful of known keywords (challenge/block/error pages,
 * common WAF/bot-check vocabulary) appear. Never the page's own markup —
 * this is diagnostic breadcrumb, not a substitute for a real HAR capture,
 * and INEM's forms can carry values worth not echoing into logs even
 * without being outright secrets.
 */
async function pageDiagnostics(page: Page): Promise<string> {
  const [title, length, hasJsChallenge, hasCaptcha, hasBlocked] = await page.evaluate(() => [
    document.title,
    document.documentElement.outerHTML.length,
    /checking your browser|enable javascript|just a moment/i.test(document.body?.innerText ?? ''),
    /captcha/i.test(document.body?.innerText ?? ''),
    /blocked|access denied|forbidden/i.test(document.body?.innerText ?? ''),
  ]);
  return `url=${page.url()} title="${title}" htmlLength=${length} jsChallenge=${hasJsChallenge} captchaText=${hasCaptcha} blockedText=${hasBlocked}`;
}
