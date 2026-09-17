/**
 * HTML scraping for the warm SAML re-mint chain (see
 * `docs/inem-portal-contract.md#warm-re-mint--plain-http-no-browser`).
 *
 * Pure string functions, deliberately not a DOM parser: no HTML parsing
 * dependency exists in this package yet, and the two things this needs to
 * recognise — "is this the FortiAuthenticator login form or the SAML
 * auto-POST assertion form" and "what are the two hidden input values on the
 * assertion form" — don't need one. Kept separate from
 * `InemSessionService` so both can be unit-tested against literal HTML
 * fixtures without a network call in sight.
 */

/**
 * The IdP response to a re-mint attempt is either the assertion auto-POST
 * form (session alive) or the FortiAuthenticator login page (session dead).
 * The login page is the one with `id="login_form"` — see the contract doc's
 * "Telling the two IdP responses apart" note.
 */
export function isInemLoginForm(html: string): boolean {
  return /id=["']login_form["']/i.test(html);
}

export interface InemSamlAssertion {
  samlResponse: string;
  relayState: string;
}

/**
 * Pulls `SAMLResponse`/`RelayState` out of the IdP's auto-POST form.
 * `null` when the page isn't an assertion form at all (call `isInemLoginForm`
 * first to tell that apart from a dead session).
 */
export function extractSamlAssertion(html: string): InemSamlAssertion | null {
  const samlResponse = extractHiddenInputValue(html, 'SAMLResponse');
  if (!samlResponse) return null;
  const relayState = extractHiddenInputValue(html, 'RelayState') ?? '';
  return { samlResponse, relayState };
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
