import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { AdminContext, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import userEvent from '@testing-library/user-event';
import { NoticeTargetType, NoticeWithStats } from '@redinfo/shared';
import { messages } from '../i18n/i18nProvider';
import { NoticesPage } from './NoticesPage';
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
      <NoticesPage />
    </AdminContext>,
  );

const NOTICE = (overrides: Partial<NoticeWithStats> = {}): NoticeWithStats => ({
  id: 'n1',
  title: 'Storm warning',
  body: 'Roads closed near the base.',
  createdById: 'u-coord',
  createdByName: 'Ana Coordinator',
  targetType: NoticeTargetType.ALL,
  targetRoles: [],
  channels: [],
  expiresAt: null,
  createdAt: '2026-08-29T09:00:00.000Z',
  updatedAt: '2026-08-29T09:00:00.000Z',
  recipientCount: 3,
  acknowledgedCount: 1,
  ...overrides,
});

describe('NoticesPage', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  it('lists the notice history with its acknowledgement count', async () => {
    mockApiFetch.mockResolvedValue([NOTICE()]);
    renderPage();

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/notices'));
    expect(await screen.findByText('Storm warning')).toBeInTheDocument();
    const row = screen.getByText('Storm warning').closest('tr');
    if (!row) throw new Error('row not found');
    expect(within(row).getByText('1 of 3 acknowledged')).toBeInTheDocument();
    expect(within(row).getByText('Active')).toBeInTheDocument();
  });

  it('shows an ended notice as ended, not active', async () => {
    mockApiFetch.mockResolvedValue([NOTICE({ expiresAt: '2020-01-01T00:00:00.000Z' })]);
    renderPage();

    expect(await screen.findByText('Ended')).toBeInTheDocument();
  });

  it('shows an empty state with no notices sent yet', async () => {
    mockApiFetch.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText('No notices sent yet.')).toBeInTheDocument();
  });

  it('creates a notice and refreshes the list', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockImplementation((path: string, options?: { method?: string }) => {
      if (path === '/notices' && (!options || options.method === undefined)) return Promise.resolve([]);
      if (path === '/notices' && options?.method === 'POST') return Promise.resolve(NOTICE());
      return Promise.resolve([]);
    });
    renderPage();

    await screen.findByText('No notices sent yet.');
    await user.click(screen.getByRole('button', { name: 'New notice' }));

    await user.type(screen.getByLabelText('Title'), 'Storm warning');
    await user.type(screen.getByLabelText('Message'), 'Roads closed near the base.');

    mockApiFetch.mockImplementation((path: string, options?: { method?: string }) => {
      if (path === '/notices' && options?.method === 'POST') return Promise.resolve(NOTICE());
      return Promise.resolve([NOTICE()]);
    });
    await user.click(screen.getByRole('button', { name: 'Send notice' }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/notices',
        expect.objectContaining({
          method: 'POST',
          body: expect.objectContaining({ title: 'Storm warning', body: 'Roads closed near the base.' }),
        }),
      ),
    );
  });

  it('deactivates an active notice', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValue([NOTICE()]);
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'End now' }));

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/notices/n1/deactivate', { method: 'POST' }));
  });
});
