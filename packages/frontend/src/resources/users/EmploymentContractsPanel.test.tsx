import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminContext, ResourceContextProvider, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { EmploymentContract, EmploymentContractKind, User, UserRole } from '@redinfo/shared';
import { UserShow } from './UserShow';
import { apiFetch } from '../../api';
import { messages } from '../../i18n/i18nProvider';

vi.mock('../../api', () => ({ apiFetch: vi.fn(), apiDownload: vi.fn(), apiUpload: vi.fn() }));

// English by convention, same as `UserShow.test.tsx` — this screen has not
// gone through #180 phase 3's Portuguese rollout yet.
const i18nProvider = polyglotI18nProvider(messages, 'en');

const mockApiFetch = apiFetch as unknown as Mock;

const person = (overrides: Partial<User> = {}): User =>
  ({
    id: 'u-1',
    email: 'ana.silva@example.test',
    firstName: 'Ana',
    lastName: 'Silva',
    roles: [UserRole.EMERGENCY_OPERATIONAL],
    provider: 'LOCAL',
    isActive: true,
    isDriver: false,
    isActiveEmergencyOperational: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    certifications: [],
    ...overrides,
  }) as User;

const CONTRACT: EmploymentContract = {
  id: 'ec-1',
  userId: 'u-1',
  kind: EmploymentContractKind.FULL_TIME,
  startDate: '2026-01-01',
  endDate: null,
  createdById: 'u-coord',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function renderShow(record: User, roles: UserRole[] = [UserRole.EMERGENCY_COORDINATOR]) {
  const dataProvider = testDataProvider({
    getOne: vi.fn(() => Promise.resolve({ data: record })) as never,
  });
  const authProvider = {
    login: () => Promise.resolve(),
    logout: () => Promise.resolve(),
    checkAuth: () => Promise.resolve(),
    checkError: () => Promise.resolve(),
    getPermissions: () => Promise.resolve(roles),
  };
  render(
    <MemoryRouter initialEntries={[`/users/${record.id}/show`]}>
      <AdminContext dataProvider={dataProvider} authProvider={authProvider} i18nProvider={i18nProvider}>
        <ResourceContextProvider value="users">
          <Routes>
            <Route path="/users/:id/show" element={<UserShow />} />
          </Routes>
        </ResourceContextProvider>
      </AdminContext>
    </MemoryRouter>,
  );
}

describe('EmploymentContractsPanel', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  it('is hidden from someone without MANAGE_PERSONNEL', async () => {
    mockApiFetch.mockResolvedValue({ userId: 'u-1', contracts: [] });
    renderShow(person(), [UserRole.EMERGENCY_OPERATIONAL]);

    await screen.findByText('Ana Silva');
    expect(screen.queryByText('Contracts')).not.toBeInTheDocument();
  });

  it('says so when nobody has a contract on file', async () => {
    mockApiFetch.mockResolvedValue({ userId: 'u-1', contracts: [] });
    renderShow(person());

    expect(await screen.findByText('No contracts on file.')).toBeInTheDocument();
  });

  it('lists a contract on file, with its kind and dates', async () => {
    mockApiFetch.mockResolvedValue({ userId: 'u-1', contracts: [CONTRACT] });
    renderShow(person());

    expect(await screen.findByText('Full time')).toBeInTheDocument();
    expect(screen.getByText('2026-01-01 – ongoing')).toBeInTheDocument();
  });

  it('adds a contract', async () => {
    mockApiFetch.mockResolvedValue({ userId: 'u-1', contracts: [] });
    const user = userEvent.setup();
    renderShow(person());

    await user.click(await screen.findByRole('button', { name: /add contract/i }));
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/employment-contracts/u-1',
        expect.objectContaining({
          method: 'POST',
          body: expect.objectContaining({ kind: EmploymentContractKind.FULL_TIME }),
        }),
      ),
    );
  });

  it('ends an open-ended contract', async () => {
    mockApiFetch.mockResolvedValue({ userId: 'u-1', contracts: [CONTRACT] });
    const user = userEvent.setup();
    renderShow(person());

    await user.click(await screen.findByRole('button', { name: /end contract/i }));
    await user.click(screen.getByRole('button', { name: /confirm/i }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/employment-contracts/u-1/ec-1',
        expect.objectContaining({ method: 'PATCH', body: expect.objectContaining({ endDate: expect.any(String) }) }),
      ),
    );
  });
});
