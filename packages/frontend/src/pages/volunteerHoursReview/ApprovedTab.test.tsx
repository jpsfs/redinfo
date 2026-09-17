import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AdminContext, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import userEvent from '@testing-library/user-event';
import { VolunteerActivityType, VolunteerHoursEntry, VolunteerHoursSource, VolunteerHoursStatus } from '@redinfo/shared';
import { messages } from '../../i18n/i18nProvider';
import { ApprovedTab } from './ApprovedTab';
import { apiFetch } from '../../api';
import { renderMobile } from '../../test/renderMobile';

vi.mock('../../api', () => ({ apiFetch: vi.fn() }));

const mockApiFetch = apiFetch as unknown as Mock;
const i18nProvider = polyglotI18nProvider(messages, 'en');

const renderPage = () =>
  render(
    <AdminContext dataProvider={testDataProvider()} i18nProvider={i18nProvider}>
      <ApprovedTab />
    </AdminContext>,
  );

const APPROVED_ENTRY: VolunteerHoursEntry = {
  id: 'e-approved',
  userId: 'u-diogo',
  user: { id: 'u-diogo', firstName: 'Diogo', lastName: 'Ribeiro' },
  source: VolunteerHoursSource.MANUAL,
  activityType: VolunteerActivityType.MEETING,
  assignmentId: null,
  scheduleId: null,
  date: '2026-08-21',
  description: null,
  baselineMinutes: null,
  proposedMinutes: 90,
  minutes: 90,
  flags: [],
  status: VolunteerHoursStatus.APPROVED,
  approvedById: 'u-mariana',
  approvedBy: { id: 'u-mariana', firstName: 'Mariana', lastName: 'Alves' },
  approvedAt: '2026-08-27T00:00:00.000Z',
  autoApproved: false,
  correctionReason: null,
  loggedById: null,
  createdAt: '2026-08-21T00:00:00.000Z',
  updatedAt: '2026-08-27T00:00:00.000Z',
};

function mockApprovedQueue(data: VolunteerHoursEntry[]) {
  mockApiFetch.mockImplementation((path: string) => {
    if (path.startsWith('/volunteer-hours/review')) {
      return Promise.resolve({
        data,
        total: data.length,
        page: 1,
        perPage: 25,
        counts: {
          all: data.length,
          noFlags: data.length,
          ranOver: 0,
          possiblyLeftEarly: 0,
          manual: data.filter((e) => e.source === VolunteerHoursSource.MANUAL).length,
          sweepable: 0,
          totalProposedMinutes: data.reduce((total, e) => total + e.proposedMinutes, 0),
          oldestDate: data.length ? data.map((e) => e.date).sort()[0] : null,
        },
      });
    }
    return Promise.resolve({});
  });
}

describe('ApprovedTab', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApprovedQueue([APPROVED_ENTRY]);
  });

  it('lists an approved entry in a table, with who approved it and when', async () => {
    renderPage();
    expect(await screen.findByText('Diogo Ribeiro')).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Mariana Alves')).toBeInTheDocument();
  });

  it('reopens an approved entry', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Diogo Ribeiro');

    await user.click(screen.getByRole('button', { name: 'Reopen' }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(`/volunteer-hours/${APPROVED_ENTRY.id}/reopen`, { method: 'POST' }),
    );
  });
});

describe('ApprovedTab — mobile', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApprovedQueue([APPROVED_ENTRY]);
  });

  it('shows cards instead of a table, with working Reopen and Dismiss actions', async () => {
    const user = userEvent.setup();
    renderMobile(<ApprovedTab />, { locale: 'en' });
    await screen.findByText('Diogo Ribeiro');

    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    await user.type(screen.getByLabelText(/Reason/), 'Duplicate entry.');
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        `/volunteer-hours/${APPROVED_ENTRY.id}/dismiss`,
        expect.objectContaining({ method: 'POST', body: { reason: 'Duplicate entry.' } }),
      ),
    );
  });
});
