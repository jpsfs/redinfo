import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminContext, ResourceContextProvider, testDataProvider } from 'react-admin';
import { MemoryRouter } from 'react-router-dom';
import { CertificationType, User, UserRole } from '@redinfo/shared';
import { UserList } from './UserList';

const person = (overrides: Partial<User> = {}): User =>
  ({
    id: 'u-1',
    email: 'ana.silva@example.test',
    firstName: 'Ana',
    lastName: 'Silva',
    role: UserRole.EMERGENCY_OPERATIONAL,
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

function renderList(data: User[], role: UserRole = UserRole.SYSTEM_ADMIN) {
  const dataProvider = testDataProvider({
    getList: vi.fn(() => Promise.resolve({ data, total: data.length })) as never,
  });
  const authProvider = {
    login: () => Promise.resolve(),
    logout: () => Promise.resolve(),
    checkAuth: () => Promise.resolve(),
    checkError: () => Promise.resolve(),
    getPermissions: () => Promise.resolve(role),
  };

  render(
    <MemoryRouter>
      <AdminContext dataProvider={dataProvider} authProvider={authProvider}>
        <ResourceContextProvider value="users">
          <UserList />
        </ResourceContextProvider>
      </AdminContext>
    </MemoryRouter>,
  );
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
    renderList([person()], UserRole.SYSTEM_ADMIN);
    await screen.findByText('Ana Silva');
    expect(screen.getByRole('link', { name: /create/i })).toBeInTheDocument();
  });

  it('hides Create from a coordinator, who may manage personnel but not accounts', async () => {
    renderList([person()], UserRole.EMERGENCY_COORDINATOR);
    await screen.findByText('Ana Silva');
    expect(screen.queryByRole('link', { name: /create/i })).not.toBeInTheDocument();
  });
});
