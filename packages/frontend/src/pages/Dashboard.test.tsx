import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AdminContext, testDataProvider } from 'react-admin';
import { MemoryRouter } from 'react-router-dom';
import { UserRole } from '@redinfo/shared';
import { CertificationAlertsTile, Dashboard } from './Dashboard';
import { apiFetch } from '../api';

vi.mock('../api', () => ({ apiFetch: vi.fn(), apiDownload: vi.fn(), apiUpload: vi.fn() }));

const mockApiFetch = apiFetch as unknown as Mock;

function renderTile(role: UserRole) {
  const authProvider = {
    login: () => Promise.resolve(),
    logout: () => Promise.resolve(),
    checkAuth: () => Promise.resolve(),
    checkError: () => Promise.resolve(),
    getPermissions: () => Promise.resolve(role),
  };

  render(
    <MemoryRouter>
      <AdminContext dataProvider={testDataProvider()} authProvider={authProvider}>
        <CertificationAlertsTile />
      </AdminContext>
    </MemoryRouter>,
  );
}

// #182 AC: "A coordinator/admin sees a dashboard tile counting personnel with
// a certification expiring within 6 months and personnel with one already
// expired, and can click through to the (already filterable) personnel
// registry" — gated the same way certification management itself is.

describe('CertificationAlertsTile', () => {
  beforeEach(() => mockApiFetch.mockReset());

  it('is invisible to someone without MANAGE_PERSONNEL', async () => {
    mockApiFetch.mockResolvedValue({ expiring: 3, expired: 1 });
    renderTile(UserRole.EMERGENCY_OPERATIONAL);

    // Give the effect a chance to run — it must not even fetch.
    await waitFor(() => expect(mockApiFetch).not.toHaveBeenCalled());
    expect(screen.queryByTestId('certification-alerts-tile')).not.toBeInTheDocument();
  });

  it('shows counts of expiring and expired personnel to a coordinator', async () => {
    mockApiFetch.mockResolvedValue({ expiring: 3, expired: 1 });
    renderTile(UserRole.EMERGENCY_COORDINATOR);

    expect(await screen.findByText('1 expired')).toBeInTheDocument();
    expect(screen.getByText('3 expiring within 6 months')).toBeInTheDocument();
  });

  it('renders nothing when there is nothing to flag', async () => {
    mockApiFetch.mockResolvedValue({ expiring: 0, expired: 0 });
    renderTile(UserRole.EMERGENCY_COORDINATOR);

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    expect(screen.queryByTestId('certification-alerts-tile')).not.toBeInTheDocument();
  });

  it('links each count through to the personnel registry, filtered', async () => {
    mockApiFetch.mockResolvedValue({ expiring: 0, expired: 2 });
    renderTile(UserRole.SYSTEM_ADMIN);

    const link = await screen.findByRole('link', { name: '2 expired' });
    expect(link).toHaveAttribute(
      'href',
      `/users?filter=${encodeURIComponent(JSON.stringify({ certificationStatus: 'EXPIRED' }))}`,
    );
  });
});

describe('Dashboard', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockImplementation((url: string) => {
      if (url === '/live-runs') return Promise.resolve([]);
      if (url === '/users/certification-alerts') return Promise.resolve({ expiring: 0, expired: 0 });
      return Promise.reject(new Error(`unexpected apiFetch(${url})`));
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ json: () => Promise.resolve({ grouped: {}, total: 0 }) }),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  // Guards #181's step 4a: `LiveRunBoard` gained an `emptyState` prop for the
  // standalone `/live-runs` screen, and the Dashboard's own copy (which passes
  // none) must keep rendering nothing at all when there are no open runs.
  it("renders nothing for the live-runs board when there are no open runs", async () => {
    const authProvider = {
      login: () => Promise.resolve(),
      logout: () => Promise.resolve(),
      checkAuth: () => Promise.resolve(),
      checkError: () => Promise.resolve(),
      getPermissions: () => Promise.resolve(UserRole.EMERGENCY_COORDINATOR),
    };

    render(
      <MemoryRouter>
        <AdminContext
          dataProvider={testDataProvider({ getList: async () => ({ data: [], total: 0 }) })}
          authProvider={authProvider}
        >
          <Dashboard />
        </AdminContext>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Bem-vindo ao RedInfo')).toBeInTheDocument();
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/live-runs'));
    expect(screen.queryByTestId('BoltIcon')).not.toBeInTheDocument();
  });
});
