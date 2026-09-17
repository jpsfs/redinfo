import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminContext, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import { messages } from '../i18n/i18nProvider';
import { apiFetch } from '../api';
import { AiConnectionsPage } from './AiConnectionsPage';

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  apiFetch: vi.fn(),
}));

vi.mock('react-admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-admin')>()),
  Title: () => null,
}));

const mockApiFetch = apiFetch as unknown as Mock;

const renderPage = () => {
  const i18nProvider = polyglotI18nProvider(messages, 'en');
  return render(
    <AdminContext dataProvider={testDataProvider()} i18nProvider={i18nProvider}>
      <AiConnectionsPage />
    </AdminContext>,
  );
};

const GRANT = {
  id: 'g1',
  clientName: 'Claude',
  scopes: ['redinfo:read', 'redinfo:write'],
  createdAt: '2026-09-01T10:00:00.000Z',
  lastUsedAt: '2026-09-05T10:00:00.000Z',
};

describe('AiConnectionsPage', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  it('lists the caller’s own active connections', async () => {
    mockApiFetch.mockResolvedValue([GRANT]);
    renderPage();

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/oauth/grants'));
    expect(await screen.findByText('Claude')).toBeInTheDocument();
    expect(screen.getByText('redinfo:read, redinfo:write')).toBeInTheDocument();
  });

  it('shows the empty state when nothing is connected', async () => {
    mockApiFetch.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText('No assistant connected yet.')).toBeInTheDocument();
  });

  it('revoking a connection calls the delete endpoint and removes it from the list', async () => {
    mockApiFetch.mockResolvedValueOnce([GRANT]);
    mockApiFetch.mockResolvedValueOnce(undefined);
    renderPage();

    await screen.findByText('Claude');
    await userEvent.click(screen.getByRole('button', { name: 'Disconnect' }));

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/oauth/grants/g1', { method: 'DELETE' }));
    await waitFor(() => expect(screen.queryByText('Claude')).not.toBeInTheDocument());
  });
});
