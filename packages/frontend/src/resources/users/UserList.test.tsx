import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminContext, ResourceContextProvider, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import { MemoryRouter } from 'react-router-dom';
import { CertificationType, User, UserRole } from '@redinfo/shared';
import { messages } from '../../i18n/i18nProvider';
import { stubMobileMatchMedia } from '../../test/renderMobile';
import { UserList } from './UserList';

// This screen has not gone through #180 phase 3's Portuguese rollout yet —
// its tests still read in English, so a real i18nProvider is pinned to 'en'
// rather than left unset (see `MyDutiesPage.test.tsx` for the same pattern).
const i18nProvider = polyglotI18nProvider(messages, 'en');

const person = (overrides: Partial<User> = {}): User =>
  ({
    id: 'u-1',
    email: 'ana.silva@example.test',
    firstName: 'Ana',
    lastName: 'Silva',
    roles: [UserRole.EMERGENCY_OPERATIONAL],
    provider: 'LOCAL',
    isActive: true,
    isDriver: true,
    isActiveEmergencyOperational: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    redCrossNumber: '118342',
    volunteerNumber: '27',
    certifications: [
      {
        id: 'cert-1',
        userId: 'u-1',
        type: CertificationType.TAS,
        validUntil: '2029-03-14',
        hasDocument: false,
        createdById: 'u-coord',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    ...overrides,
  }) as User;

function renderList(data: User[], roles: UserRole[] = [UserRole.SYSTEM_ADMIN]) {
  const getList = vi.fn(() => Promise.resolve({ data, total: data.length })) as never;
  const dataProvider = testDataProvider({ getList });
  const authProvider = {
    login: () => Promise.resolve(),
    logout: () => Promise.resolve(),
    checkAuth: () => Promise.resolve(),
    checkError: () => Promise.resolve(),
    getPermissions: () => Promise.resolve(roles),
  };

  render(
    <MemoryRouter>
      <AdminContext dataProvider={dataProvider} authProvider={authProvider} i18nProvider={i18nProvider}>
        <ResourceContextProvider value="users">
          <UserList />
        </ResourceContextProvider>
      </AdminContext>
    </MemoryRouter>,
  );

  return { getList: getList as unknown as ReturnType<typeof vi.fn> };
}

// ── The personnel registry (ADO #163) ─────────────────────────────────────────
//
// isDriver and readiness are computed, not columns a coordinator sets: the
// list shows what the API derived, not a flag anyone types.

describe('the personnel registry', () => {
  it('shows the name, role, readiness and certifications', async () => {
    renderList([person()]);

    expect(await screen.findByText('Ana Silva')).toBeInTheDocument();
    expect(screen.getByText('Operational')).toBeInTheDocument();
    expect(screen.getByText(/TAS/)).toBeInTheDocument();
  });

  it('marks someone with no valid TAT or TAS as not operational', async () => {
    renderList([person({ isActiveEmergencyOperational: false, certifications: [] })]);

    expect(await screen.findByText('Not operational')).toBeInTheDocument();
  });

  it('shows a dash rather than an empty cell for someone with no certifications', async () => {
    renderList([person({ certifications: [] })]);

    await screen.findByText('Ana Silva');
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('offers Create only to someone who may manage accounts', async () => {
    renderList([person()], [UserRole.SYSTEM_ADMIN]);
    await screen.findByText('Ana Silva');
    expect(screen.getByRole('link', { name: /create/i })).toBeInTheDocument();
  });

  it('hides Create from a coordinator, who may manage personnel but not accounts', async () => {
    renderList([person()], [UserRole.EMERGENCY_COORDINATOR]);
    await screen.findByText('Ana Silva');
    expect(screen.queryByRole('link', { name: /create/i })).not.toBeInTheDocument();
  });

  it('offers Create to someone who holds MANAGE_USERS via any of several roles (#multi-role)', async () => {
    renderList([person()], [UserRole.EMERGENCY_COORDINATOR, UserRole.SYSTEM_ADMIN]);
    await screen.findByText('Ana Silva');
    expect(screen.getByRole('link', { name: /create/i })).toBeInTheDocument();
  });

  it('shows a chip for every role a person holds', async () => {
    renderList([person({ roles: [UserRole.EMERGENCY_COORDINATOR, UserRole.SYSTEM_ADMIN] })]);
    await screen.findByText('Ana Silva');
    expect(screen.getByText('Emergency Coordinator')).toBeInTheDocument();
    expect(screen.getByText('System Administrator')).toBeInTheDocument();
  });
});

// ── Active by default, everyone on request ────────────────────────────────
//
// A departed volunteer's record isn't deleted, just hidden — the roster
// defaults to active-only and a chip, not a buried "Add filter" entry, is
// the way back to seeing everyone.

describe('the personnel registry — active/all filter', () => {
  it('asks the API for active members only by default', async () => {
    const { getList } = renderList([person()]);
    await screen.findByText('Ana Silva');
    expect(getList).toHaveBeenCalledWith(
      'users',
      expect.objectContaining({ filter: expect.objectContaining({ isActive: 'true' }) }),
    );
  });

  it('drops the isActive filter once "Show all" is tapped', async () => {
    const { getList } = renderList([person()]);
    await screen.findByText('Ana Silva');

    await userEvent.click(screen.getByText('Show all'));

    expect(getList).toHaveBeenLastCalledWith(
      'users',
      expect.objectContaining({ filter: expect.not.objectContaining({ isActive: expect.anything() }) }),
    );
  });
});

// ── Mobile layout (#phone-friendly personnel list) ────────────────────────

describe('the personnel registry on a phone', () => {
  it('shows stacked cards instead of a table', async () => {
    stubMobileMatchMedia();
    renderList([person()]);

    await screen.findByText('Ana Silva');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText('Operational')).toBeInTheDocument();
  });
});
