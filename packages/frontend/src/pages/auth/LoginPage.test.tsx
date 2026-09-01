import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AdminContext, Notification, testDataProvider, AuthProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import { messages } from '../../i18n/i18nProvider';
import { LoginPage } from './LoginPage';

// This is a desk/configuration screen, exercised here in English — same
// convention as `hospitals.test.tsx`: a real i18nProvider is required since
// labels resolve through useT()/react-admin's own translate rather than
// being hardcoded.
const i18nProvider = polyglotI18nProvider(messages, 'en');

function renderLoginPage(authProviderOverrides: Partial<AuthProvider> = {}) {
  const authProvider: AuthProvider = {
    login: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    checkAuth: vi.fn().mockRejectedValue(new Error('not authenticated')),
    checkError: vi.fn().mockResolvedValue(undefined),
    getIdentity: vi.fn().mockResolvedValue({ id: 'u-1', fullName: 'Test User' }),
    getPermissions: vi.fn().mockResolvedValue(null),
    ...authProviderOverrides,
  };

  render(
    <AdminContext dataProvider={testDataProvider()} authProvider={authProvider} i18nProvider={i18nProvider}>
      <LoginPage />
      <Notification />
    </AdminContext>,
  );

  return { authProvider };
}

describe('LoginPage — keep me signed in', () => {
  it('defaults the checkbox to checked and both OAuth links to remember=true', async () => {
    renderLoginPage();

    const checkbox = await screen.findByRole('checkbox', { name: /keep me signed in/i });
    expect(checkbox).toBeChecked();

    expect(screen.getByRole('link', { name: /sign in with google/i })).toHaveAttribute(
      'href',
      expect.stringContaining('remember=true'),
    );
    expect(screen.getByRole('link', { name: /sign in with microsoft/i })).toHaveAttribute(
      'href',
      expect.stringContaining('remember=true'),
    );
  });

  it('unchecking the box flips both OAuth links to remember=false', async () => {
    renderLoginPage();

    const checkbox = await screen.findByRole('checkbox', { name: /keep me signed in/i });
    fireEvent.click(checkbox);

    await waitFor(() =>
      expect(screen.getByRole('link', { name: /sign in with google/i })).toHaveAttribute(
        'href',
        expect.stringContaining('remember=false'),
      ),
    );
    expect(screen.getByRole('link', { name: /sign in with microsoft/i })).toHaveAttribute(
      'href',
      expect.stringContaining('remember=false'),
    );
  });

  it('submits the remember choice alongside the credentials on password sign-in', async () => {
    const { authProvider } = renderLoginPage();

    fireEvent.change(await screen.findByLabelText(/username/i), { target: { value: 'ana@example.test' } });
    fireEvent.change(screen.getByLabelText(/^password/i), { target: { value: 'S3cret!!' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /keep me signed in/i })); // uncheck

    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(authProvider.login).toHaveBeenCalled());
    const values = (authProvider.login as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(values).toMatchObject({ username: 'ana@example.test', password: 'S3cret!!', remember: false });
  });
});

// ── DISABLE_LOCAL_LOGIN — the password form asks the backend before showing ─
// itself, since the flag is server-side (see `AuthService.isLocalLoginEnabled`).

describe('LoginPage — local login disabled', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState(null, '', '/');
  });

  it('hides the username/password form and keeps the OAuth buttons when the backend says local login is off', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(new Response(JSON.stringify({ localLoginEnabled: false }), { status: 200 })),
      ),
    );
    renderLoginPage();

    await waitFor(() => expect(screen.queryByLabelText(/username/i)).not.toBeInTheDocument());
    expect(screen.getByRole('link', { name: /sign in with google/i })).toBeInTheDocument();
  });

  it('keeps the form up if the backend is unreachable, rather than locking out the only working method', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network error'))));
    renderLoginPage();

    expect(await screen.findByLabelText(/username/i)).toBeInTheDocument();
  });

  // The backend redirects into the hash route (`/#/login?error=...`) because
  // `<Admin>` mounts a HashRouter; the bare-path form is what a backend that
  // has not been redeployed yet still sends, and must keep working.
  it.each([
    ['hash route', '/#/login?error=oauth_account_not_found'],
    ['bare path', '/login?error=oauth_account_not_found'],
  ])(
    'shows an error notification when redirected back with no matching OAuth account (%s)',
    async (_shape, url) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.resolve(new Response(JSON.stringify({ localLoginEnabled: true }), { status: 200 }))),
      );
      window.history.replaceState(null, '', url);

      renderLoginPage();

      expect(await screen.findByText(/no account for that google\/microsoft sign-in/i)).toBeInTheDocument();
    },
  );
});
