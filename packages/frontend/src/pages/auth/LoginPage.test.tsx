import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AdminContext, testDataProvider, AuthProvider } from 'react-admin';
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
