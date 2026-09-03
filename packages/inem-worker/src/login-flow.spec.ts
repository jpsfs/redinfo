import { sanitizeUserAgent } from './login-flow';

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
