import { describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AdminContext, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import { messages } from '../i18n/i18nProvider';
import { apiFetch } from '../api';
import { AboutDialog } from './AboutDialog';

vi.mock('../api', () => ({
  apiFetch: vi.fn(),
}));

const mockApiFetch = apiFetch as unknown as Mock;

const i18nProvider = polyglotI18nProvider(messages, 'en');

function renderDialog(open = true) {
  const onClose = vi.fn();
  render(
    <AdminContext dataProvider={testDataProvider()} i18nProvider={i18nProvider}>
      <AboutDialog open={open} onClose={onClose} />
    </AdminContext>,
  );
  return { onClose };
}

describe('AboutDialog', () => {
  it('shows the commit and its date once GET /health/version resolves', async () => {
    mockApiFetch.mockResolvedValue({ commit: 'sha-a1b2c3d4', commitDate: '2026-09-11T20:01:09+00:00' });

    renderDialog();

    expect(await screen.findByText('Version: sha-a1b2c3d4')).toBeInTheDocument();
    expect(screen.getByText('Built on: 11 Sep 2026')).toBeInTheDocument();
    expect(screen.getByText('Built by José Pedro Silva')).toBeInTheDocument();
    expect(mockApiFetch).toHaveBeenCalledWith('/health/version');
  });

  it('falls back to a visibly-unbuilt state if the request fails', async () => {
    mockApiFetch.mockRejectedValue(new Error('network down'));

    renderDialog();

    expect(await screen.findByText('Version: dev')).toBeInTheDocument();
    expect(screen.queryByText(/Built on:/)).not.toBeInTheDocument();
  });

  it('does not fetch while closed', async () => {
    renderDialog(false);

    await waitFor(() => expect(mockApiFetch).not.toHaveBeenCalled());
  });
});
