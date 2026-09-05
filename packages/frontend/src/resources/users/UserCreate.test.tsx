import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminContext, Notification, ResourceContextProvider, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import { MemoryRouter } from 'react-router-dom';
import { messages } from '../../i18n/i18nProvider';
import { UserCreate } from './UserCreate';

// ── Provider gates the password field ───────────────────────────────────────
//
// A GOOGLE/MICROSOFT account never gets a password (see
// `UsersService.create`) — the form shouldn't even offer the field once a
// non-LOCAL provider is picked, so nobody types one in only to have it
// silently dropped server-side.

const i18nProvider = polyglotI18nProvider(messages, 'en');

function renderCreate(create: ReturnType<typeof vi.fn>) {
  render(
    <MemoryRouter>
      <AdminContext dataProvider={testDataProvider({ create: create as never })} i18nProvider={i18nProvider}>
        <ResourceContextProvider value="users">
          <UserCreate />
          <Notification />
        </ResourceContextProvider>
      </AdminContext>
    </MemoryRouter>,
  );
}

describe('UserCreate — provider vs password', () => {
  it('shows the password field for the default LOCAL provider', async () => {
    renderCreate(vi.fn());
    expect(await screen.findByLabelText(/Provider/)).toBeInTheDocument();
    expect(await screen.findByLabelText(/^Password/, { selector: 'input[type="password"]' })).toBeInTheDocument();
  });

  it('hides the password field once a Google/Microsoft provider is chosen', async () => {
    renderCreate(vi.fn());

    await userEvent.click(await screen.findByLabelText(/Provider/));
    await userEvent.click(await screen.findByRole('option', { name: 'Google' }));

    expect(screen.queryByLabelText(/^Password/, { selector: 'input[type="password"]' })).not.toBeInTheDocument();
  });

  it('submits a Google account with no password, and validation does not block it', async () => {
    const create = vi.fn((_resource: string, params: { data: Record<string, unknown> }) =>
      Promise.resolve({ data: { id: 'u-new', ...params.data } }),
    );
    renderCreate(create);

    await userEvent.type(screen.getByLabelText(/First Name/), 'Ana');
    await userEvent.type(screen.getByLabelText(/Last Name/), 'Silva');
    await userEvent.type(screen.getByLabelText(/Email/), 'ana@example.test');
    await userEvent.click(screen.getByLabelText(/Provider/));
    await userEvent.click(await screen.findByRole('option', { name: 'Google' }));
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const saved = create.mock.calls[0][1].data;
    expect(saved.provider).toBe('GOOGLE');
    expect(saved.password).toBeUndefined();
  });
});

describe('UserCreate — full name field (administrative use only)', () => {
  it('is optional, and travels alongside the required first/last name', async () => {
    const create = vi.fn((_resource: string, params: { data: Record<string, unknown> }) =>
      Promise.resolve({ data: { id: 'u-new', ...params.data } }),
    );
    renderCreate(create);

    await userEvent.type(screen.getByLabelText(/First Name/), 'Ana');
    await userEvent.type(screen.getByLabelText(/Last Name/), 'Silva');
    await userEvent.type(screen.getByLabelText(/Email/), 'ana@example.test');
    await userEvent.type(
      screen.getByLabelText(/^Password/, { selector: 'input[type="password"]' }),
      'SecurePass1!',
    );
    await userEvent.type(screen.getByLabelText(/Full name/), 'Ana Maria Silva Ferreira');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const saved = create.mock.calls[0][1].data;
    expect(saved.firstName).toBe('Ana');
    expect(saved.lastName).toBe('Silva');
    expect(saved.fullName).toBe('Ana Maria Silva Ferreira');
  });
});
