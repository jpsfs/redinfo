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
const authProvider = {
  login: () => Promise.resolve(),
  logout: () => Promise.resolve(),
  checkAuth: () => Promise.resolve(),
  checkError: () => Promise.resolve(),
  getPermissions: () => Promise.resolve(),
  getIdentity: () => Promise.resolve({ id: 'u-ana', fullName: 'Ana Silva' } as never),
};
const renderPage = () =>
  render(
    <AdminContext dataProvider={testDataProvider()} authProvider={authProvider} i18nProvider={i18nProvider}>
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
    await user.type(screen.getByLabelText(/Description/), 'Monthly meeting.');
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

  it('logs a manual entry for a rota activity type, not just Meeting/Training/Other', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockImplementation((path: string) => {
      if (path === '/volunteer-hours') return Promise.resolve(ENTRY);
      return Promise.resolve({ entries: [ENTRY], totalApprovedMinutes: 0, totalPendingMinutes: 240 });
    });
    renderPage();
    await screen.findByText('Emergency');

    await user.click(screen.getByRole('button', { name: 'Log hours' }));
    await user.click(screen.getByLabelText('Activity'));
    await user.click(await screen.findByRole('option', { name: 'Emergency' }));
    await user.type(screen.getByLabelText(/Description/), 'Covered a shift the schedule missed.');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/volunteer-hours',
        expect.objectContaining({
          method: 'POST',
          body: expect.objectContaining({ activityType: VolunteerActivityType.EMERGENCY }),
        }),
      ),
    );
  });

  it('logs a manual entry with no description, for anything other than Other', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockImplementation((path: string) => {
      if (path === '/volunteer-hours') return Promise.resolve(ENTRY);
      return Promise.resolve({ entries: [ENTRY], totalApprovedMinutes: 0, totalPendingMinutes: 240 });
    });
    renderPage();
    await screen.findByText('Emergency');

    await user.click(screen.getByRole('button', { name: 'Log hours' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/volunteer-hours',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
  });

  it('blocks an empty description for Other before it ever reaches the API', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Emergency');

    await user.click(screen.getByRole('button', { name: 'Log hours' }));
    await user.click(screen.getByLabelText('Activity'));
    await user.click(await screen.findByRole('option', { name: 'Other' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText(/Describe what the activity was/)).toBeInTheDocument();
    expect(mockApiFetch).not.toHaveBeenCalledWith('/volunteer-hours', expect.anything());
  });

  it('offers no edit action once an entry is approved', async () => {
    mockApiFetch.mockResolvedValue({
      entries: [{ ...ENTRY, status: VolunteerHoursStatus.APPROVED }],
      totalApprovedMinutes: 240,
      totalPendingMinutes: 0,
    });
    renderPage();
    await screen.findByText('Emergency');
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('corrects a pending SCHEDULED entry, without offering to change its activity or date', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockImplementation((path: string) => {
      if (path === `/volunteer-hours/${ENTRY.id}`) return Promise.resolve({ ...ENTRY, minutes: 180 });
      return Promise.resolve({ entries: [ENTRY], totalApprovedMinutes: 0, totalPendingMinutes: 240 });
    });
    renderPage();
    await screen.findByText('Emergency');

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.queryByLabelText('Activity')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Date')).not.toBeInTheDocument();

    const minutesField = screen.getByLabelText('Duration (minutes)');
    await user.clear(minutesField);
    await user.type(minutesField, '180');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        `/volunteer-hours/${ENTRY.id}`,
        expect.objectContaining({
          method: 'PATCH',
          body: expect.objectContaining({ minutes: 180 }),
        }),
      ),
    );
  });

  it('lets a MANUAL entry be corrected on every field', async () => {
    const user = userEvent.setup();
    const manualEntry = {
      ...ENTRY,
      id: 'e-manual',
      source: VolunteerHoursSource.MANUAL,
      activityType: VolunteerActivityType.MEETING,
      assignmentId: null,
      scheduleId: null,
      description: 'Monthly meeting.',
    };
    mockApiFetch.mockImplementation((path: string) => {
      if (path === `/volunteer-hours/${manualEntry.id}`) return Promise.resolve(manualEntry);
      return Promise.resolve({ entries: [manualEntry], totalApprovedMinutes: 0, totalPendingMinutes: 240 });
    });
    renderPage();
    await screen.findByText('Manual');

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText('Activity')).toBeInTheDocument();
    expect(screen.getByLabelText('Date')).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/Description/));
    await user.type(screen.getByLabelText(/Description/), 'Corrected description.');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        `/volunteer-hours/${manualEntry.id}`,
        expect.objectContaining({
          method: 'PATCH',
          body: expect.objectContaining({ description: 'Corrected description.' }),
        }),
      ),
    );
  });

  it('blocks a MANUAL edit that empties the description of an Other entry', async () => {
    const user = userEvent.setup();
    const manualEntry = {
      ...ENTRY,
      id: 'e-manual',
      source: VolunteerHoursSource.MANUAL,
      activityType: VolunteerActivityType.OTHER,
      assignmentId: null,
      scheduleId: null,
      description: 'Covering the front desk.',
    };
    mockApiFetch.mockResolvedValue({
      entries: [manualEntry],
      totalApprovedMinutes: 0,
      totalPendingMinutes: 240,
    });
    renderPage();
    await screen.findByText('Manual');

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.clear(screen.getByLabelText(/Description/));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText(/Describe what the activity was/)).toBeInTheDocument();
    expect(mockApiFetch).not.toHaveBeenCalledWith(
      `/volunteer-hours/${manualEntry.id}`,
      expect.anything(),
    );
  });

  it('allows a MANUAL edit that empties the description of a non-Other entry', async () => {
    const user = userEvent.setup();
    const manualEntry = {
      ...ENTRY,
      id: 'e-manual',
      source: VolunteerHoursSource.MANUAL,
      activityType: VolunteerActivityType.MEETING,
      assignmentId: null,
      scheduleId: null,
      description: 'Monthly meeting.',
    };
    mockApiFetch.mockImplementation((path: string) => {
      if (path === `/volunteer-hours/${manualEntry.id}`) {
        return Promise.resolve({ ...manualEntry, description: null });
      }
      return Promise.resolve({ entries: [manualEntry], totalApprovedMinutes: 0, totalPendingMinutes: 240 });
    });
    renderPage();
    await screen.findByText('Manual');

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.clear(screen.getByLabelText(/Description/));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        `/volunteer-hours/${manualEntry.id}`,
        expect.objectContaining({ method: 'PATCH' }),
      ),
    );
  });

  it('offers to delete a pending MANUAL entry of your own', async () => {
    mockApiFetch.mockResolvedValue({
      entries: [
        {
          ...ENTRY,
          id: 'e-manual',
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
    await screen.findByText('Manual');
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('never offers to delete a SCHEDULED entry — there is no shift-less way to file one by hand', async () => {
    renderPage();
    await screen.findByText('Emergency');
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('never offers to delete an entry that is not your own', async () => {
    mockApiFetch.mockResolvedValue({
      entries: [
        {
          ...ENTRY,
          id: 'e-manual',
          userId: 'u-someone-else',
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
    await screen.findByText('Manual');
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('deletes a pending MANUAL entry after confirming', async () => {
    const user = userEvent.setup();
    const manualEntry = {
      ...ENTRY,
      id: 'e-manual',
      source: VolunteerHoursSource.MANUAL,
      activityType: VolunteerActivityType.MEETING,
      assignmentId: null,
      scheduleId: null,
    };
    mockApiFetch.mockImplementation((path: string) => {
      if (path === `/volunteer-hours/${manualEntry.id}`) return Promise.resolve(undefined);
      return Promise.resolve({ entries: [manualEntry], totalApprovedMinutes: 0, totalPendingMinutes: 240 });
    });
    renderPage();
    await screen.findByText('Manual');

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const buttons = await screen.findAllByRole('button', { name: 'Delete' });
    await user.click(buttons[buttons.length - 1]);

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        `/volunteer-hours/${manualEntry.id}`,
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
  });
});
