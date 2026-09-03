import { Page } from 'playwright';
import { readSettledContent, sanitizeUserAgent, submitFormAndReadSettledContent } from './login-flow';

describe('sanitizeUserAgent', () => {
  it('strips the HeadlessChrome token that INEM\'s FortiGate blocks', () => {
    const headless =
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/128.0.0.0 Safari/537.36';
    const cleaned = sanitizeUserAgent(headless);
    expect(cleaned).toBe(
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    );
    // The block is keyed on the literal token — the sanitised UA must not carry it.
    expect(cleaned).not.toMatch(/Headless/);
  });

  it('leaves an already-headed Chrome UA untouched', () => {
    const headed =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
    expect(sanitizeUserAgent(headed)).toBe(headed);
  });
});

/**
 * The real error Playwright raises when `page.content()` races a navigation
 * that a `form.submit()` kicked off — the exact production failure these two
 * helpers exist to absorb.
 */
const NAVIGATING = new Error('page.content: Unable to retrieve content because the page is navigating and changing the content.');

/** Minimal stand-in for the bits of `Page` the settling helpers touch. */
function fakePage(contentResults: Array<string | Error>) {
  const calls = { waitForNavigation: 0, submit: 0, order: [] as string[] };
  const page = {
    waitForLoadState: jest.fn().mockResolvedValue(undefined),
    waitForTimeout: jest.fn().mockResolvedValue(undefined),
    waitForNavigation: jest.fn(() => {
      calls.waitForNavigation += 1;
      calls.order.push('waitForNavigation');
      return Promise.resolve(null);
    }),
    content: jest.fn(() => {
      const next = contentResults.shift();
      return next instanceof Error ? Promise.reject(next) : Promise.resolve(next as string);
    }),
    locator: () => ({
      first: () => ({
        evaluate: () => {
          calls.submit += 1;
          calls.order.push('submit');
          return Promise.resolve();
        },
      }),
    }),
  };
  return { page: page as unknown as Page, calls };
}

describe('readSettledContent', () => {
  it('retries until the navigation settles instead of surfacing the race as a failure', async () => {
    const { page } = fakePage([NAVIGATING, NAVIGATING, '<html>otp</html>']);
    await expect(readSettledContent(page)).resolves.toBe('<html>otp</html>');
    expect(page.content).toHaveBeenCalledTimes(3);
  });

  it('rethrows anything that is not the navigation race', async () => {
    const boom = new Error('Target page, context or browser has been closed');
    const { page } = fakePage([boom]);
    await expect(readSettledContent(page)).rejects.toThrow(boom);
  });
});

describe('submitFormAndReadSettledContent', () => {
  it('arms the navigation wait before submitting, so the commit cannot be missed', async () => {
    const { page, calls } = fakePage(['<html>otp</html>']);
    await expect(submitFormAndReadSettledContent(page)).resolves.toBe('<html>otp</html>');
    expect(calls.order).toEqual(['waitForNavigation', 'submit']);
  });
});
