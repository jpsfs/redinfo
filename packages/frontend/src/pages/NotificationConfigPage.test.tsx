import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AdminContext, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import userEvent from '@testing-library/user-event';
import { NotificationChannel, NotificationType } from '@redinfo/shared';
import { messages } from '../i18n/i18nProvider';
import { NotificationConfigPage } from './NotificationConfigPage';
import { apiFetch } from '../api';

vi.mock('../api', () => ({ apiFetch: vi.fn() }));

vi.mock('react-admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-admin')>()),
  Title: () => null,
}));

const mockApiFetch = apiFetch as unknown as Mock;

const i18nProvider = polyglotI18nProvider(messages, 'en');
const renderPage = () =>
  render(
    <AdminContext dataProvider={testDataProvider()} i18nProvider={i18nProvider}>
      <NotificationConfigPage />
    </AdminContext>,
  );

describe('NotificationConfigPage', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  it('loads the org-wide defaults for the NOTICE type', async () => {
    mockApiFetch.mockResolvedValue([
      { channel: NotificationChannel.EMAIL, enabled: true },
      { channel: NotificationChannel.WEB_PUSH, enabled: false },
    ]);
    renderPage();

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(`/notifications/config/${NotificationType.NOTICE}`),
    );
    expect(await screen.findByRole('checkbox', { name: 'Email' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Push notification' })).not.toBeChecked();
  });

  it('toggling a channel saves exactly the enabled set', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValue([
      { channel: NotificationChannel.EMAIL, enabled: false },
      { channel: NotificationChannel.WEB_PUSH, enabled: false },
    ]);
    renderPage();

    const emailToggle = await screen.findByRole('checkbox', { name: 'Email' });
    await user.click(emailToggle);

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(`/notifications/config/${NotificationType.NOTICE}`, {
        method: 'PUT',
        body: { channels: [NotificationChannel.EMAIL] },
      }),
    );
  });
});
