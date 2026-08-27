import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AdminContext, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import userEvent from '@testing-library/user-event';
import {
  VolunteerActivityType,
  VolunteerHoursEntry,
  VolunteerHoursSource,
  VolunteerHoursStatus,
} from '@redinfo/shared';
import { messages } from '../i18n/i18nProvider';
import { MyHoursPage } from './MyHoursPage';
import { apiFetch } from '../api';

vi.mock('../api', () => ({ apiFetch: vi.fn(), apiDownload: vi.fn() }));

vi.mock('react-admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-admin')>()),
  Title: () => null,
}));

const mockApiFetch = apiFetch as unknown as Mock;

const i18nProvider = polyglotI18nProvider(messages, 'en');
const renderPage = () =>
  render(
    <AdminContext dataProvider={testDataProvider()} i18nProvider={i18nProvider}>
      <MyHoursPage />
    </AdminContext>,
  );

const ENTRY: VolunteerHoursEntry = {
  id: 'e1',
  userId: 'u-ana',
  source: VolunteerHoursSource.SCHEDULED,
  activityType: VolunteerActivityType.EMERGENCY,
  assignmentId: 'a1',
  scheduleId: 's1',
  date: '2026-10-03',
  description: null,
  baselineMinutes: 240,
  proposedMinutes: 240,
  minutes: 240,
  flags: [],
  status: VolunteerHoursStatus.PENDING,
  approvedById: null,
  approvedAt: null,
  autoApproved: false,
  correctionReason: null,
  loggedById: null,
  createdAt: '2026-10-04T00:00:00.000Z',
  updatedAt: '2026-10-04T00:00:00.000Z',
};

describe('MyHoursPage', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValue({
      entries: [ENTRY],
      totalApprovedMinutes: 0,
      totalPendingMinutes: 240,
    });
  });

  it("reads the signed-in person's own hours", async () => {
    renderPage();
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/volunteer-hours/me'));
  });

  it('shows a clean scheduled entry, pending, with its activity and duration', async () => {
    renderPage();
    expect(await screen.findByText('Emergency')).toBeInTheDocument();
    expect(screen.getByText('4h')).toBeInTheDocument();
    expect(screen.queryByText('Manual')).not.toBeInTheDocument();
  });

  it('flags a run-over entry', async () => {
    mockApiFetch.mockResolvedValue({
      entries: [{ ...ENTRY, flags: ['RAN_OVER'], proposedMinutes: 285, minutes: 285 }],
      totalApprovedMinutes: 0,
      totalPendingMinutes: 285,
    });
    renderPage();
    expect(await screen.findByText('Ran past the scheduled end')).toBeInTheDocument();
  });

  it('badges a manual entry', async () => {
    mockApiFetch.mockResolvedValue({
      entries: [
        {
          ...ENTRY,
          source: VolunteerHoursSource.MANUAL,
          activityType: VolunteerActivityType.MEETING,
          assignmentId: null,
          scheduleId: null,
        },
      ],
      totalApprovedMinutes: 0,
      totalPendingMinutes: 240,
    });
    renderPage();
    expect(await screen.findByText('Manual')).toBeInTheDocument();
  });

  it('shows a coordinator correction and its reason', async () => {
    mockApiFetch.mockResolvedValue({
      entries: [
        {
          ...ENTRY,
          status: VolunteerHoursStatus.APPROVED,
          minutes: 180,
          correctionReason: 'Left an hour early.',
        },
      ],
      totalApprovedMinutes: 180,
      totalPendingMinutes: 0,
    });
    renderPage();
    expect(
      await screen.findByText('Corrected by a coordinator: Left an hour early.'),
    ).toBeInTheDocument();
  });

  it('says so plainly when there is nothing yet', async () => {
    mockApiFetch.mockResolvedValue({ entries: [], totalApprovedMinutes: 0, totalPendingMinutes: 0 });
    renderPage();
    expect(await screen.findByText('No hours recorded yet.')).toBeInTheDocument();
  });

  it('reports a failure to load', async () => {
    mockApiFetch.mockRejectedValue(new Error('Network unavailable'));
    renderPage();
    expect(await screen.findByText('Network unavailable')).toBeInTheDocument();
  });

  it('logs a manual entry through the dialog', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockImplementation((path: string) => {
      if (path === '/volunteer-hours') return Promise.resolve(ENTRY);
      return Promise.resolve({ entries: [ENTRY], totalApprovedMinutes: 0, totalPendingMinutes: 240 });
    });
    renderPage();
    await screen.findByText('Emergency');

    await user.click(screen.getByRole('button', { name: 'Log hours' }));
    await user.type(screen.getByLabelText('Description'), 'Monthly meeting.');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/volunteer-hours',
        expect.objectContaining({
          method: 'POST',
          body: expect.objectContaining({ description: 'Monthly meeting.' }),
        }),
      ),
    );
  });

  it('blocks an empty description before it ever reaches the API', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Emergency');

    await user.click(screen.getByRole('button', { name: 'Log hours' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText(/Describe what the activity was/)).toBeInTheDocument();
    expect(mockApiFetch).not.toHaveBeenCalledWith('/volunteer-hours', expect.anything());
  });
});
