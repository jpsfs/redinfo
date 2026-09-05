import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AdminContext, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import userEvent from '@testing-library/user-event';
import { NotificationChannel, NotificationType } from '@redinfo/shared';
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

  // Fixed, reused arrays rather than fresh literals per call: `useNotify` is mocked to a
  // new `vi.fn()` on every render (see the top-level mock), so a mocked fetch that
  // returns a *new* array reference each call never lets state settle — every refetch
  // looks like a real change, and the mount effect never stops re-triggering itself.
  // Existing tests above avoid this with `mockResolvedValue`, which always hands back
  // the same reference; these two need per-URL routing, so they cache theirs instead.
  const EMPTY_PREFS: never[] = [];
  const ANNOUNCEMENT_ON = [{ type: NotificationType.BIRTHDAY_ANNOUNCEMENT, enabled: true }];

  it('loads type preferences, defaulting an untouched type to its own system default', async () => {
    mockApiFetch.mockImplementation((url: string) =>
      Promise.resolve(url === '/notifications/type-preferences' ? ANNOUNCEMENT_ON : EMPTY_PREFS),
    );
    renderCard();

    // Never touched: falls back to its system default (on for reminders, off for team announcements).
    expect(await screen.findByRole('checkbox', { name: 'Shift reminder (24h ahead)' })).toBeChecked();
    // Explicitly turned on, overriding the "off by default" for this type.
    expect(await screen.findByRole('checkbox', { name: 'Heads-up on a teammate’s birthday' })).toBeChecked();
  });

  it('turning a notification type off saves the full type preference set', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockImplementation(() => Promise.resolve(EMPTY_PREFS));
    renderCard();

    const toggle = await screen.findByRole('checkbox', { name: 'Birthday wishes for me' });
    await user.click(toggle);

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/notifications/type-preferences', {
        method: 'PUT',
        body: {
          preferences: [
            { type: NotificationType.SHIFT_REMINDER, enabled: true },
            { type: NotificationType.BIRTHDAY_GREETING, enabled: false },
            { type: NotificationType.BIRTHDAY_ANNOUNCEMENT, enabled: false },
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

  // Regression: support must come from capability, not from a registration
  // that already happens to exist. `ready` resolving *after* mount (the
  // normal case — registerSW.ts waits for `load`) used to leave the card
  // stuck on "unsupported" forever.
  it('shows the subscribe button once a still-pending registration settles', async () => {
    mockApiFetch.mockResolvedValue([]);
    let resolveReady: (registration: unknown) => void;
    const ready = new Promise((resolve) => {
      resolveReady = resolve;
    });
    vi.stubGlobal('PushManager', class {});
    vi.stubGlobal('navigator', {
      ...navigator,
      serviceWorker: { ready },
    });

    renderCard();
    expect(screen.queryByRole('button', { name: 'Enable on this device' })).not.toBeInTheDocument();

    resolveReady!({ pushManager: { getSubscription: () => Promise.resolve(null) } });

    expect(await screen.findByRole('button', { name: 'Enable on this device' })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
