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
import { VolunteerHoursReviewPage } from './VolunteerHoursReviewPage';
import { apiDownload, apiFetch } from '../api';

vi.mock('../api', () => ({ apiFetch: vi.fn(), apiDownload: vi.fn() }));

vi.mock('react-admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-admin')>()),
  Title: () => null,
}));

const mockApiFetch = apiFetch as unknown as Mock;
const mockApiDownload = apiDownload as unknown as Mock;

const i18nProvider = polyglotI18nProvider(messages, 'en');
const renderPage = () =>
  render(
    <AdminContext dataProvider={testDataProvider()} i18nProvider={i18nProvider}>
      <VolunteerHoursReviewPage />
    </AdminContext>,
  );

const ENTRY: VolunteerHoursEntry = {
  id: 'e1',
  userId: 'u-ana',
  user: { id: 'u-ana', firstName: 'Ana', lastName: 'Silva' },
  source: VolunteerHoursSource.SCHEDULED,
  activityType: VolunteerActivityType.EMERGENCY,
  assignmentId: 'a1',
  scheduleId: 's1',
  date: '2026-10-03',
  description: null,
  baselineMinutes: 240,
  proposedMinutes: 285,
  minutes: 285,
  flags: ['RAN_OVER'],
  status: VolunteerHoursStatus.PENDING,
  approvedById: null,
  approvedAt: null,
  autoApproved: false,
  correctionReason: null,
  loggedById: null,
  createdAt: '2026-10-04T00:00:00.000Z',
  updatedAt: '2026-10-04T00:00:00.000Z',
};

describe('VolunteerHoursReviewPage', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiDownload.mockReset();
    mockApiFetch.mockResolvedValue([ENTRY]);
  });

  it('reads the pending review queue', async () => {
    renderPage();
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/volunteer-hours/pending'));
  });

  it("lists an entry with the volunteer's name, activity, date and flag", async () => {
    renderPage();
    expect(await screen.findByText('Ana Silva')).toBeInTheDocument();
    expect(screen.getByText('Emergency')).toBeInTheDocument();
    expect(screen.getByText('Ran past the scheduled end')).toBeInTheDocument();
  });

  it('says so plainly when the queue is empty', async () => {
    mockApiFetch.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText('Nothing to review right now.')).toBeInTheDocument();
  });

  it('approves as proposed with no correction', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Review' }));
    await user.click(screen.getByRole('button', { name: 'Approve' }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/volunteer-hours/e1/approve', {
        method: 'POST',
        body: {},
      }),
    );
  });

  it('requires a reason before approving a corrected value', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Review' }));

    const minutesField = screen.getByLabelText('Minutes to credit');
    await user.clear(minutesField);
    await user.type(minutesField, '180');
    await user.click(screen.getByRole('button', { name: 'Approve' }));

    expect(
      await screen.findByText('Correcting the value needs a reason.'),
    ).toBeInTheDocument();
    expect(mockApiFetch).not.toHaveBeenCalledWith('/volunteer-hours/e1/approve', expect.anything());
  });

  it('approves a correction once a reason is given', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Review' }));

    const minutesField = screen.getByLabelText('Minutes to credit');
    await user.clear(minutesField);
    await user.type(minutesField, '180');
    await user.type(screen.getByLabelText('Reason for the correction'), 'Left early, confirmed.');
    await user.click(screen.getByRole('button', { name: 'Approve' }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/volunteer-hours/e1/approve', {
        method: 'POST',
        body: { minutes: 180, correctionReason: 'Left early, confirmed.' },
      }),
    );
  });

  it('exports the summary CSV for the chosen range', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Ana Silva');

    await user.click(screen.getByRole('button', { name: 'Download CSV' }));

    await waitFor(() =>
      expect(mockApiDownload).toHaveBeenCalledWith(
        expect.stringMatching(/^\/volunteer-hours\/summary\/csv\?from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}$/),
        expect.stringMatching(/^volunteer-hours-.*\.csv$/),
      ),
    );
  });
});
