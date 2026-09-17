import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AdminContext, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import userEvent from '@testing-library/user-event';
import { NoticeTargetType, NoticeWithReceipt, NotificationChannel } from '@redinfo/shared';
import { messages } from '../i18n/i18nProvider';
import { MyNoticesPage } from './MyNoticesPage';
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
      <MyNoticesPage />
    </AdminContext>,
  );

const NOTICE = (overrides: Partial<NoticeWithReceipt> = {}): NoticeWithReceipt => ({
  id: 'n1',
  title: 'Storm warning',
  body: 'Roads closed near the base.',
  createdById: 'u-coord',
  createdByName: 'Ana Coordinator',
  targetType: NoticeTargetType.ALL,
  targetRoles: [],
  channels: [NotificationChannel.EMAIL],
  expiresAt: null,
  createdAt: '2026-08-29T09:00:00.000Z',
  updatedAt: '2026-08-29T09:00:00.000Z',
  receipt: { readAt: null, acknowledgedAt: null },
  ...overrides,
});

describe('MyNoticesPage', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  it('lists the caller’s own active notices', async () => {
    mockApiFetch.mockResolvedValue([NOTICE()]);
    renderPage();

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/notices/me'));
    expect(await screen.findByText('Storm warning')).toBeInTheDocument();
    expect(screen.getByText('Roads closed near the base.')).toBeInTheDocument();
  });

  it('marks an unread notice read as soon as the list loads', async () => {
    mockApiFetch.mockResolvedValue([NOTICE()]);
    renderPage();

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/notices/n1/read', { method: 'POST' }));
  });

  it('does not re-mark an already-read notice', async () => {
    mockApiFetch.mockResolvedValue([NOTICE({ receipt: { readAt: '2026-08-29T10:00:00.000Z', acknowledgedAt: null } })]);
    renderPage();

    await screen.findByText('Storm warning');
    expect(mockApiFetch).not.toHaveBeenCalledWith('/notices/n1/read', { method: 'POST' });
  });

  it('shows an empty state with nothing active', async () => {
    mockApiFetch.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText('No active notices.')).toBeInTheDocument();
  });

  it('acknowledges a notice and removes the acknowledge button', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValue([NOTICE()]);
    renderPage();

    const button = await screen.findByRole('button', { name: 'Acknowledge' });
    await user.click(button);

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/notices/n1/acknowledge', { method: 'POST' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Acknowledge' })).not.toBeInTheDocument());
    expect(screen.getByText('Acknowledged')).toBeInTheDocument();
  });
});
