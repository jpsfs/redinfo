import { extractSamlAssertion, isInemLoginForm } from './inem-saml.util';

const LOGIN_PAGE = `
<html><body>
  <form id="login_form" method="post" action="/saml-idp/portalpem/login/">
    <input type="text" name="username" />
    <input type="password" name="password" />
    <input type="hidden" name="csrfmiddlewaretoken" value="abc123" />
  </form>
</body></html>
`;

const ASSERTION_PAGE = `
<html><body onload="document.forms[0].submit()">
  <form method="post" action="https://portalpem.inem.pt/saml/acs">
    <input type="hidden" name="SAMLResponse" value="PHNhbWxwOlJlc3BvbnNlIHhtbG5zPQ==" />
    <input type="hidden" name="RelayState" value="/Dashboard" />
  </form>
</body></html>
`;

// Same fields, opposite attribute order — observed to vary between templates.
const ASSERTION_PAGE_VALUE_FIRST = `
<form>
  <input value="PHNhbWxwOlJlc3BvbnNlIHhtbG5zPQ==" type="hidden" name="SAMLResponse" />
  <input value="/Dashboard" type="hidden" name="RelayState" />
</form>
`;

describe('isInemLoginForm', () => {
  it('recognises the FortiAuthenticator login page', () => {
    expect(isInemLoginForm(LOGIN_PAGE)).toBe(true);
  });

  it('does not mistake the assertion auto-POST form for a login page', () => {
    expect(isInemLoginForm(ASSERTION_PAGE)).toBe(false);
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

  it('decodes numeric HTML entities in the value, since base64 padding can be escaped', () => {
    const html = `<input type="hidden" name="SAMLResponse" value="YWJj&#43;&#61;" />`;
    expect(extractSamlAssertion(html)?.samlResponse).toBe('YWJj+=');
  });

  it('returns null for a login page rather than a bogus assertion', () => {
    expect(extractSamlAssertion(LOGIN_PAGE)).toBeNull();
  });

  it('defaults RelayState to empty string when the form omits it', () => {
    const html = `<input type="hidden" name="SAMLResponse" value="xyz" />`;
    expect(extractSamlAssertion(html)).toEqual({ samlResponse: 'xyz', relayState: '' });
  });
});
