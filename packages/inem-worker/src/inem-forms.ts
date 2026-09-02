/**
 * HTML recognition for the cold-login flow
 * (docs/inem-portal-contract.md#cold-login--playwright-packagesinem-worker).
 * Pure string functions, deliberately not a DOM parser — the same reasoning
 * as `packages/backend/src/inem/inem-saml.util.ts`, which this intentionally
 * mirrors rather than imports: this package has no dependency on the backend
 * (see README.md), so a second, small, independently-tested copy is the
 * price of staying stateless.
 *
 * `detectPageKind` is what `login-flow.ts` polls after every navigation to
 * find out where it landed — including the one case the login flow can't
 * tell apart from a genuine hang without it: submitting credentials and
 * landing back on the *same* login form, which is the "a challenge appeared"
 * signal `#215`'s brief calls out ("If a challenge ever does appear, fail
 * closed and alert; do not attempt to solve it.").
 */

export type InemPageKind = 'login' | 'otp' | 'assertion' | 'unknown';

/** The FortiAuthenticator credential page — `id="login_form"`, same signature as the warm re-mint's `isInemLoginForm`. */
export function isLoginForm(html: string): boolean {
  return /id=["']login_form["']/i.test(html);
}

/** The OTP page — identified by its `token_code` input, the one field name unique to this step. */
export function isOtpForm(html: string): boolean {
  return /name=["']token_code["']/i.test(html);
}

export interface InemSamlAssertion {
  samlResponse: string;
  relayState: string;
}

/**
 * The SAML auto-POST assertion page (`form#logged_in_post_form` per #215's
 * brief) — identified by its `SAMLResponse` hidden input, same signature the
 * backend's warm re-mint already trusts. `login-flow.ts` never actually reads
 * these values back out (a real browser auto-submits the form itself), but
 * `detectPageKind` still needs to recognise the page to know the flow reached
 * it, and extracting the pair is worth keeping for whichever debugging or
 * fallback path eventually wants it.
 */
export function extractSamlAssertion(html: string): InemSamlAssertion | null {
  const samlResponse = extractHiddenInputValue(html, 'SAMLResponse');
  if (!samlResponse) return null;
  const relayState = extractHiddenInputValue(html, 'RelayState') ?? '';
  return { samlResponse, relayState };
}

export function detectPageKind(html: string): InemPageKind {
  if (isLoginForm(html)) return 'login';
  if (isOtpForm(html)) return 'otp';
  if (extractSamlAssertion(html)) return 'assertion';
  return 'unknown';
}

function extractHiddenInputValue(html: string, name: string): string | null {
  // The two attributes can appear in either order in the markup, so both are
  // tried. Matches are non-greedy and confined to a single `<input .../>` tag
  // by excluding `>` from the attribute-soup class.
  const nameFirst = new RegExp(`<input[^>]*name=["']${name}["'][^>]*value=["']([^"']*)["']`, 'i');
  const valueFirst = new RegExp(`<input[^>]*value=["']([^"']*)["'][^>]*name=["']${name}["']`, 'i');
  const match = html.match(nameFirst) ?? html.match(valueFirst);
  return match ? decodeHtmlEntities(match[1]) : null;
}

/**
 * Just enough entity decoding for a SAML assertion blob: it's base64
 * (`&#43;`/`&#x2B;` for `+`, `&#61;`/`&#x3D;` for the `=` padding) wrapped in
 * an HTML attribute, not arbitrary markup.
 */
function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
