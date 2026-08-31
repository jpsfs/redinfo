import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminContext, Notification, ResourceContextProvider, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { User, UserRole } from '@redinfo/shared';
import { messages } from '../../i18n/i18nProvider';
import { UserEdit } from './UserEdit';

// ── Provider gates the password field, and is admin-only — same reasoning
// as `UserCreate.test.tsx` — plus once an account is linked to OAuth (see
// `UsersService.findOrLinkOAuthUser`), an admin is the only way back.

const i18nProvider = polyglotI18nProvider(messages, 'en');

const ANA: User = {
  id: 'u-1',
  email: 'ana.silva@example.test',
  firstName: 'Ana',
  lastName: 'Silva',
  roles: [UserRole.EMERGENCY_OPERATIONAL],
  provider: 'LOCAL' as User['provider'],
  isActive: true,
  isDriver: false,
  isActiveEmergencyOperational: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  certifications: [],
} as unknown as User;

function renderEdit(update: ReturnType<typeof vi.fn>, roles: UserRole[] = [UserRole.SYSTEM_ADMIN]) {
  const authProvider = {
    login: () => Promise.resolve(),
    logout: () => Promise.resolve(),
    checkAuth: () => Promise.resolve(),
    checkError: () => Promise.resolve(),
    getPermissions: () => Promise.resolve(roles),
  };

  render(
    <MemoryRouter initialEntries={[`/users/${ANA.id}`]}>
      <AdminContext
        dataProvider={testDataProvider({
          getOne: vi.fn(() => Promise.resolve({ data: ANA })) as never,
          update: update as never,
        })}
        authProvider={authProvider}
        i18nProvider={i18nProvider}
      >
        <ResourceContextProvider value="users">
          <Routes>
            <Route path="/users/:id" element={<UserEdit />} />
            <Route path="/users" element={<div />} />
          </Routes>
          <Notification />
        </ResourceContextProvider>
      </AdminContext>
    </MemoryRouter>,
  );
}

describe('UserEdit — provider field', () => {
  it('an admin sees the provider selector and can move an account off LOCAL', async () => {
    const update = vi.fn((_resource: string, params: { data: Record<string, unknown> }) =>
      Promise.resolve({ data: { ...ANA, ...params.data } }),
    );
    renderEdit(update);

    await userEvent.click(await screen.findByLabelText(/Provider/));
    await userEvent.click(await screen.findByRole('option', { name: 'Google' }));
    expect(screen.queryByLabelText(/^Password/, { selector: 'input[type="password"]' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    // `Edit`'s default `mutationMode` is `undoable` — see `MaterialItemEdit.test.tsx`'s
    // same comment: the actual `dataProvider.update` call is deferred behind
    // the undo window, not fired on click.
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1), { timeout: 6000 });
    expect(update.mock.calls[0][1].data.provider).toBe('GOOGLE');
  });

  it('a coordinator (no MANAGE_USERS) never sees the provider field at all', async () => {
    renderEdit(vi.fn(), [UserRole.EMERGENCY_COORDINATOR]);

    await screen.findByLabelText(/First Name/);
    expect(screen.queryByLabelText(/Provider/)).not.toBeInTheDocument();
  });
});

describe('UserEdit — roles field (#multi-role)', () => {
  it('an admin can give someone more than one role at once', async () => {
    const update = vi.fn((_resource: string, params: { data: Record<string, unknown> }) =>
      Promise.resolve({ data: { ...ANA, ...params.data } }),
    );
    renderEdit(update);

    await userEvent.click(await screen.findByLabelText(/Roles/));
    await userEvent.click(await screen.findByRole('option', { name: 'System Administrator' }));
    await userEvent.click(screen.getByRole('option', { name: 'Emergency Coordinator' }));
    await userEvent.keyboard('{Escape}');

    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1), { timeout: 6000 });
    expect(update.mock.calls[0][1].data.roles).toEqual(
      expect.arrayContaining([
        UserRole.EMERGENCY_OPERATIONAL,
        UserRole.SYSTEM_ADMIN,
        UserRole.EMERGENCY_COORDINATOR,
      ]),
    );
  });
});
