import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AdminContext, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import userEvent from '@testing-library/user-event';
import { NotificationChannel } from '@redinfo/shared';
import { messages } from '../i18n/i18nProvider';
import { NotificationSettingsCard } from './NotificationSettingsCard';
import { apiFetch } from '../api';

vi.mock('../api', () => ({ apiFetch: vi.fn() }));

vi.mock('react-admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-admin')>()),
  useNotify: () => vi.fn(),
}));

const mockApiFetch = apiFetch as unknown as Mock;

const i18nProvider = polyglotI18nProvider(messages, 'en');
const renderCard = () =>
  render(
    <AdminContext dataProvider={testDataProvider()} i18nProvider={i18nProvider}>
      <NotificationSettingsCard />
    </AdminContext>,
  );

describe('NotificationSettingsCard', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  it('loads and reflects the caller’s own preferences', async () => {
    mockApiFetch.mockResolvedValue([
      { channel: NotificationChannel.EMAIL, enabled: true },
      { channel: NotificationChannel.WEB_PUSH, enabled: false },
    ]);
    renderCard();

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/notifications/preferences'));
    expect(await screen.findByRole('checkbox', { name: 'Email' })).toBeChecked();
  });

  it('turning a channel off saves the full preference set', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValue([
      { channel: NotificationChannel.EMAIL, enabled: true },
      { channel: NotificationChannel.WEB_PUSH, enabled: true },
    ]);
    renderCard();

    const emailToggle = await screen.findByRole('checkbox', { name: 'Email' });
    await user.click(emailToggle);

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/notifications/preferences', {
        method: 'PUT',
        body: {
          preferences: [
            { channel: NotificationChannel.EMAIL, enabled: false },
            { channel: NotificationChannel.WEB_PUSH, enabled: true },
          ],
        },
      }),
    );
  });

  // jsdom implements neither `navigator.serviceWorker` nor `PushManager`,
  // which is exactly the "this browser can't do push" case in production
  // (Safari before 16.4, most WebViews) — no extra stubbing needed to hit it.
  it('shows the unsupported message when the browser has no push support', async () => {
    mockApiFetch.mockResolvedValue([]);
    renderCard();

    expect(await screen.findByText('This browser does not support push notifications.')).toBeInTheDocument();
  });
});
