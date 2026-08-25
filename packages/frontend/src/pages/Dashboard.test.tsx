import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AdminContext, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import { MemoryRouter } from 'react-router-dom';
import { UserRole } from '@redinfo/shared';
import { messages } from '../i18n/i18nProvider';
import { CertificationAlertsTile, Dashboard } from './Dashboard';
import { apiFetch } from '../api';

vi.mock('../api', () => ({ apiFetch: vi.fn(), apiDownload: vi.fn(), apiUpload: vi.fn() }));

const mockApiFetch = apiFetch as unknown as Mock;

// English, matching this file's existing assertions — the Dashboard reads
// through a real i18nProvider now, rather than a mix of a hardcoded
// Portuguese welcome card and hardcoded English tiles.
const i18nProvider = polyglotI18nProvider(messages, 'en');

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
      <AdminContext dataProvider={testDataProvider()} authProvider={authProvider} i18nProvider={i18nProvider}>
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
      if (url === '/vehicles/low-stock') return Promise.resolve({ grouped: {}, total: 0 });
      return Promise.reject(new Error(`unexpected apiFetch(${url})`));
    });
  });

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
          i18nProvider={i18nProvider}
        >
          <Dashboard />
        </AdminContext>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Welcome to RedInfo')).toBeInTheDocument();
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/live-runs'));
    expect(screen.queryByTestId('BoltIcon')).not.toBeInTheDocument();
  });

  // Regression: the low-stock panel used to read its bearer token from a
  // `localStorage['auth']` key that never existed, so `/vehicles/low-stock`
  // always 401'd and the panel then crashed reading `.grouped` off the error
  // body — taking the whole Dashboard down for every signed-in user. It now
  // goes through `apiFetch`, which rejects cleanly on a non-2xx.
  it('does not crash the Dashboard when the low-stock endpoint is unauthorized', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url === '/live-runs') return Promise.resolve([]);
      if (url === '/users/certification-alerts') return Promise.resolve({ expiring: 0, expired: 0 });
      if (url === '/vehicles/low-stock') return Promise.reject(new Error('Unauthorized'));
      return Promise.reject(new Error(`unexpected apiFetch(${url})`));
    });

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
          i18nProvider={i18nProvider}
        >
          <Dashboard />
        </AdminContext>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Welcome to RedInfo')).toBeInTheDocument();
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/vehicles/low-stock'));
    expect(screen.queryByText(/Low Stock Vehicles/)).not.toBeInTheDocument();
    // Still there afterwards — proves the panel's own error didn't unmount the tree.
    expect(screen.getByText('Welcome to RedInfo')).toBeInTheDocument();
  });
});
