import { AuthController } from './auth.controller';

// ── Where OAuth sends the browser back to ──────────────────────────────────
//
// The frontend is react-admin 5, which mounts a HashRouter: every in-app
// route lives after the `#`. A redirect to the bare path `/auth/callback`
// therefore renders `index.html` with an empty hash, the router resolves `/`,
// and an unauthenticated visitor is bounced to `#/login` — with the tokens
// still sitting unread in the query string. These tests pin the `/#` so that
// regression cannot come back silently.

const FRONTEND = 'https://staging-redcross.jpsfs.com';

function makeController(user: unknown) {
  const authService = {
    login: jest.fn().mockResolvedValue({ accessToken: 'at', refreshToken: 'rt' }),
  };
  const controller = new AuthController(authService as never);
  const req: any = { user, query: { state: 'true' } };
  const res = { redirect: jest.fn() };
  return { controller, req, res, authService };
}

const ORIGINAL_FRONTEND_URL = process.env.FRONTEND_URL;

afterEach(() => {
  if (ORIGINAL_FRONTEND_URL === undefined) delete process.env.FRONTEND_URL;
  else process.env.FRONTEND_URL = ORIGINAL_FRONTEND_URL;
});

const providers: Array<[string, (c: AuthController, req: any, res: any) => Promise<void>]> = [
  ['google', (c, req, res) => c.googleCallback(req, res)],
  ['microsoft', (c, req, res) => c.microsoftCallback(req, res)],
];

describe.each(providers)('%s OAuth callback', (_provider, invoke) => {
  it('redirects into the SPA hash route, tokens in the fragment', async () => {
    process.env.FRONTEND_URL = FRONTEND;
    const { controller, req, res } = makeController({ id: 'u-1' });

    await invoke(controller, req, res);

    const url: string = res.redirect.mock.calls[0][0];
    expect(url).toBe(`${FRONTEND}/#/auth/callback?accessToken=at&refreshToken=rt&remember=true`);
    // The `#` must come before the `?`, or the params land outside the
    // fragment, where the router cannot read them.
    expect(url.indexOf('#')).toBeLessThan(url.indexOf('?'));
  });

  it('carries remember=false through when the user did not opt in', async () => {
    process.env.FRONTEND_URL = FRONTEND;
    const { controller, req, res } = makeController({ id: 'u-1' });
    req.query.state = 'false';

    await invoke(controller, req, res);

    expect(res.redirect.mock.calls[0][0]).toContain('remember=false');
  });

  it('does not double the slash when FRONTEND_URL has a trailing one', async () => {
    process.env.FRONTEND_URL = `${FRONTEND}/`;
    const { controller, req, res } = makeController({ id: 'u-1' });

    await invoke(controller, req, res);

    expect(res.redirect.mock.calls[0][0]).toMatch(
      /^https:\/\/staging-redcross\.jpsfs\.com\/#\/auth\/callback\?/,
    );
  });

  it('sends an unknown account to the login route as a hash route too', async () => {
    process.env.FRONTEND_URL = FRONTEND;
    const { controller, req, res, authService } = makeController(undefined);

    await invoke(controller, req, res);

    expect(authService.login).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(`${FRONTEND}/#/login?error=oauth_account_not_found`);
  });
});
