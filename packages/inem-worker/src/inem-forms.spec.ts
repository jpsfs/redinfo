import { detectPageKind, extractSamlAssertion, isLoginForm, isOtpForm } from './inem-forms';

const LOGIN_PAGE = `
<html><body>
  <form id="login_form" method="post" action="/saml-idp/portalpem/login/">
    <input type="text" name="username" />
    <input type="password" name="password" />
    <input type="hidden" name="csrfmiddlewaretoken" value="abc123" />
    <input type="hidden" name="use_token_input" value="0" />
    <input type="hidden" name="use_token_input_hidden" value="true" />
  </form>
</body></html>
`;

const OTP_PAGE = `
<html><body>
  <form method="post" action="/saml-idp/portalpem/login/">
    <input type="hidden" name="csrfmiddlewaretoken" value="def456" />
    <input type="hidden" name="username" value="delegation" />
    <input type="text" name="token_code" />
  </form>
</body></html>
`;

const ASSERTION_PAGE = `
<html><body onload="document.forms[0].submit()">
  <form id="logged_in_post_form" method="post" action="https://portalpem.inem.pt/saml/acs">
    <input type="hidden" name="SAMLResponse" value="PHNhbWxwOlJlc3BvbnNlIHhtbG5zPQ==" />
    <input type="hidden" name="RelayState" value="/Dashboard" />
  </form>
</body></html>
`;

// Same fields, opposite attribute order — observed to vary between templates
// on the warm path; assumed to hold here too.
const ASSERTION_PAGE_VALUE_FIRST = `
<form>
  <input value="PHNhbWxwOlJlc3BvbnNlIHhtbG5zPQ==" type="hidden" name="SAMLResponse" />
  <input value="/Dashboard" type="hidden" name="RelayState" />
</form>
`;

const DASHBOARD_PAGE = `<html><body><div id="app">Dashboard</div></body></html>`;

describe('isLoginForm', () => {
  it('recognises the FortiAuthenticator credential page', () => {
    expect(isLoginForm(LOGIN_PAGE)).toBe(true);
  });

  it('does not mistake the OTP page for the login page', () => {
    expect(isLoginForm(OTP_PAGE)).toBe(false);
  });
});

describe('isOtpForm', () => {
  it('recognises the OTP page by its token_code field', () => {
    expect(isOtpForm(OTP_PAGE)).toBe(true);
  });

  it('does not mistake the login page for the OTP page', () => {
    expect(isOtpForm(LOGIN_PAGE)).toBe(false);
  });
});

describe('extractSamlAssertion', () => {
  it('extracts SAMLResponse and RelayState from the auto-POST form', () => {
    expect(extractSamlAssertion(ASSERTION_PAGE)).toEqual({
      samlResponse: 'PHNhbWxwOlJlc3BvbnNlIHhtbG5zPQ==',
      relayState: '/Dashboard',
    });
  });

  it('handles value-before-name attribute order', () => {
    expect(extractSamlAssertion(ASSERTION_PAGE_VALUE_FIRST)).toEqual({
      samlResponse: 'PHNhbWxwOlJlc3BvbnNlIHhtbG5zPQ==',
      relayState: '/Dashboard',
    });
  });

  it('returns null for a login page rather than a bogus assertion', () => {
    expect(extractSamlAssertion(LOGIN_PAGE)).toBeNull();
  });
});

describe('detectPageKind', () => {
  it.each([
    ['login', LOGIN_PAGE],
    ['otp', OTP_PAGE],
    ['assertion', ASSERTION_PAGE],
  ] as const)('recognises %s pages', (kind, html) => {
    expect(detectPageKind(html)).toBe(kind);
  });

  it('returns "unknown" for a page that matches none of the three shapes — e.g. the dashboard', () => {
    expect(detectPageKind(DASHBOARD_PAGE)).toBe('unknown');
  });
});
