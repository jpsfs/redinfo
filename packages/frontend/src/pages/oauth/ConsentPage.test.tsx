import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminContext, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { messages } from '../../i18n/i18nProvider';
import { apiFetch } from '../../api';
import { ConsentPage } from './ConsentPage';

vi.mock('../../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api')>()),
  apiFetch: vi.fn(),
}));

const mockApiFetch = apiFetch as unknown as Mock;

const renderConsentPage = (ticket = 'the-ticket') => {
  const i18nProvider = polyglotI18nProvider(messages, 'en');
  return render(
    <MemoryRouter initialEntries={[`/oauth/consent?ticket=${ticket}`]}>
      <AdminContext dataProvider={testDataProvider()} i18nProvider={i18nProvider}>
        <Routes>
          <Route path="/oauth/consent" element={<ConsentPage />} />
        </Routes>
      </AdminContext>
    </MemoryRouter>,
  );
};

describe('ConsentPage', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    Object.assign(window, { location: { ...window.location, href: '' } });
  });

  it('loads the client name and scopes for the ticket in the URL', async () => {
    mockApiFetch.mockResolvedValue({ clientName: 'Claude', scopes: ['redinfo:read'] });

    renderConsentPage();

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/oauth/consent/the-ticket'));
    expect(await screen.findByText(/Claude is requesting access/)).toBeInTheDocument();
    expect(screen.getByText(/Read information/)).toBeInTheDocument();
  });

  it('approving posts an allow decision and follows the returned redirect', async () => {
    mockApiFetch.mockResolvedValueOnce({ clientName: 'Claude', scopes: ['redinfo:read'] });
    mockApiFetch.mockResolvedValueOnce({ redirectUrl: 'https://claude.ai/callback?code=abc&state=s1' });
    renderConsentPage();

    await screen.findByText(/Claude is requesting access/);
    await userEvent.click(screen.getByRole('button', { name: 'Allow' }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/oauth/consent/decision', {
        method: 'POST',
        body: { ticket: 'the-ticket', decision: 'allow' },
      }),
    );
    await waitFor(() => expect(window.location.href).toBe('https://claude.ai/callback?code=abc&state=s1'));
  });

  it('denying posts a deny decision, never an allow', async () => {
    mockApiFetch.mockResolvedValueOnce({ clientName: 'Claude', scopes: ['redinfo:read'] });
    mockApiFetch.mockResolvedValueOnce({ redirectUrl: 'https://claude.ai/callback?error=access_denied' });
    renderConsentPage();

    await screen.findByText(/Claude is requesting access/);
    await userEvent.click(screen.getByRole('button', { name: 'Deny' }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/oauth/consent/decision', {
        method: 'POST',
        body: { ticket: 'the-ticket', decision: 'deny' },
      }),
    );
  });

  it('shows an error instead of a consent prompt for an invalid ticket', async () => {
    mockApiFetch.mockRejectedValue(new Error('This connection request has expired or is invalid'));

    renderConsentPage();

    expect(await screen.findByText(/expired or is invalid/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Allow' })).not.toBeInTheDocument();
  });
});
