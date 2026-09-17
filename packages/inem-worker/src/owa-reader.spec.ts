import { BrowserContext } from 'playwright';
import { OwaSessionExpiredError, readOtpFromOwa } from './owa-reader';

const SINCE = '2026-09-03T16:41:04.433Z';

/** One OTP row as `scrapeVisibleMessages` extracts it in-browser, before parsing. */
const OTP_ROW = {
  subject: 'Não lida Token code: 123456 INEM FortiAuthenticator 17:48',
  sender: 'noreply_inem@inem.pt',
  receivedAtRaw: 'qui, 03/09/2026 17:48',
};

/**
 * Stand-in for the Playwright objects `readOtpFromOwa` drives. `$$eval` returns
 * canned rows rather than running the extractor against a DOM — the extraction
 * itself is covered by `otp-mail.spec.ts` plus live verification; what matters
 * here is the *order and cadence* of the calls around it, which is where the
 * production bug lived.
 */
function fakeOwa(opts: { rowsPerCycle: Array<typeof OTP_ROW[]>; url?: string }) {
  const calls = { waitForSelector: 0, reload: 0, evals: 0, order: [] as string[] };
  let cycle = 0;
  const page = {
    goto: jest.fn().mockResolvedValue(undefined),
    url: () => opts.url ?? 'https://outlook.office.com/mail/',
    waitForSelector: jest.fn(() => {
      calls.waitForSelector += 1;
      calls.order.push('waitForSelector');
      return Promise.resolve({});
    }),
    $$eval: jest.fn(() => {
      calls.order.push('scrape');
      const rows = opts.rowsPerCycle[cycle] ?? [];
      cycle += 1;
      calls.evals += 1;
      return Promise.resolve(rows);
    }),
    waitForTimeout: jest.fn().mockResolvedValue(undefined),
    reload: jest.fn(() => {
      calls.reload += 1;
      calls.order.push('reload');
      return Promise.resolve(undefined);
    }),
    locator: () => ({ first: () => ({ count: () => Promise.resolve(0), click: () => Promise.resolve() }) }),
    close: jest.fn().mockResolvedValue(undefined),
  };
  const context = {
    newPage: () => Promise.resolve(page),
    storageState: () => Promise.resolve({ cookies: [] }),
  };
  return { context: context as unknown as BrowserContext, page, calls };
}

const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

describe('readOtpFromOwa', () => {
  beforeEach(() => jest.clearAllMocks());

  it('waits for the message list to render before the first scrape', async () => {
    // OWA is an SPA — `domcontentloaded` fires seconds before any row exists
    // (empty at +1.1s, populated at +4.2s in production). Scraping first is
    // what made a full mailbox look empty.
    const { context, calls } = fakeOwa({ rowsPerCycle: [[OTP_ROW]] });
    await expect(readOtpFromOwa(context, SINCE, log, 'Europe/Lisbon')).resolves.toMatchObject({ code: '123456' });
    expect(calls.order.indexOf('waitForSelector')).toBeLessThan(calls.order.indexOf('scrape'));
  });

  it('does not reload the page on every poll cycle', async () => {
    // A reload per cycle both hammered OWA and reset the SPA, so the next
    // scrape always ran before it had re-rendered — the loop could never win.
    const { context, calls } = fakeOwa({ rowsPerCycle: [[], [], [], [OTP_ROW]] });
    await expect(readOtpFromOwa(context, SINCE, log, 'Europe/Lisbon')).resolves.toMatchObject({ code: '123456' });
    expect(calls.evals).toBe(4);
    expect(calls.reload).toBe(0);
  });

  it('re-scrapes the live DOM across cycles until the mail shows up', async () => {
    const { context } = fakeOwa({ rowsPerCycle: [[], [OTP_ROW]] });
    await expect(readOtpFromOwa(context, SINCE, log, 'Europe/Lisbon')).resolves.toMatchObject({ code: '123456' });
  });

  it('reports an expired OWA session rather than polling an inbox that is not there', async () => {
    const { context } = fakeOwa({ rowsPerCycle: [[]], url: 'https://login.microsoftonline.com/common/oauth2/authorize' });
    await expect(readOtpFromOwa(context, SINCE, log, 'Europe/Lisbon')).rejects.toBeInstanceOf(OwaSessionExpiredError);
  });
});
