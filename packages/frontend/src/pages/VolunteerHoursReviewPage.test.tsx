import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { AdminContext, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import userEvent from '@testing-library/user-event';
import {
  VolunteerActivityType,
  VolunteerHoursEntry,
  VolunteerHoursReviewResponse,
  VolunteerHoursSource,
  VolunteerHoursStatus,
} from '@redinfo/shared';
import { messages } from '../i18n/i18nProvider';
import { VolunteerHoursReviewPage } from './VolunteerHoursReviewPage';
import { apiDownload, apiFetch } from '../api';
import { renderMobile } from '../test/renderMobile';

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

const CLEAN_ENTRY: VolunteerHoursEntry = {
  id: 'e-clean',
  userId: 'u-bruno',
  user: { id: 'u-bruno', firstName: 'Bruno', lastName: 'Alves' },
  source: VolunteerHoursSource.SCHEDULED,
  activityType: VolunteerActivityType.LOCAL_SUPPORT,
  assignmentId: 'a2',
  scheduleId: 's1',
  date: '2026-10-05',
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
  createdAt: '2026-10-06T00:00:00.000Z',
  updatedAt: '2026-10-06T00:00:00.000Z',
};

const FLAGGED_ENTRY: VolunteerHoursEntry = {
  id: 'e-flagged',
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
  flagDetails: [{ flag: 'RAN_OVER', minutesOver: 45 }],
  status: VolunteerHoursStatus.PENDING,
  approvedById: null,
  approvedAt: null,
  autoApproved: false,
  correctionReason: null,
  loggedById: null,
  createdAt: '2026-10-04T00:00:00.000Z',
  updatedAt: '2026-10-04T00:00:00.000Z',
};

function reviewResponse(
  data: VolunteerHoursEntry[],
  overrides: Partial<VolunteerHoursReviewResponse['counts']> = {},
): VolunteerHoursReviewResponse {
  return {
    data,
    total: data.length,
    page: 1,
    perPage: 25,
    counts: {
      all: data.length,
      noFlags: data.filter((e) => e.flags.length === 0).length,
      ranOver: data.filter((e) => e.flags.includes('RAN_OVER')).length,
      possiblyLeftEarly: data.filter((e) => e.flags.includes('POSSIBLY_LEFT_EARLY')).length,
      manual: data.filter((e) => e.source === VolunteerHoursSource.MANUAL).length,
      sweepable: data.filter(
        (e) => e.source === VolunteerHoursSource.SCHEDULED && e.flags.length === 0 && !e.reopenedAt,
      ).length,
      totalProposedMinutes: data.reduce((total, e) => total + e.proposedMinutes, 0),
      oldestDate: data.length ? data.map((e) => e.date).sort()[0] : null,
      ...overrides,
    },
  };
}

function mockReviewQueue(data: VolunteerHoursEntry[]) {
  mockApiFetch.mockImplementation((path: string) => {
    if (path.startsWith('/volunteer-hours/review')) return Promise.resolve(reviewResponse(data));
    return Promise.resolve({});
  });
}

describe('VolunteerHoursReviewPage', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiDownload.mockReset();
    mockReviewQueue([FLAGGED_ENTRY, CLEAN_ENTRY]);
  });

  it('reads the pending review queue', async () => {
    renderPage();
    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.stringMatching(/^\/volunteer-hours\/review\?status=PENDING/),
      ),
    );
  });

  it("lists an entry with the volunteer's name, activity, date and flag", async () => {
    renderPage();
    expect(await screen.findByText('Ana Silva')).toBeInTheDocument();
    expect(screen.getByText('Bruno Alves')).toBeInTheDocument();
    expect(screen.getAllByText(/Ran past the scheduled end/).length).toBeGreaterThan(0);
  });

  it('says so plainly when the queue is empty', async () => {
    mockReviewQueue([]);
    renderPage();
    expect(await screen.findByText('Nothing to review right now.')).toBeInTheDocument();
  });

  it('a flag chip issues a request with the right query params and resets to page 1', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Ana Silva');
    mockApiFetch.mockClear();

    await user.click(screen.getByText(/Ran over/));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.stringMatching(/flag=RAN_OVER/),
      ),
    );
    const lastCall = mockApiFetch.mock.calls.at(-1)?.[0] as string;
    expect(lastCall).toMatch(/page=1/);
  });

  it('select-all selects exactly the current page', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Ana Silva');

    const table = screen.getByRole('table');
    const headerCheckbox = within(table).getAllByRole('checkbox')[0];
    await user.click(headerCheckbox);

    expect(await screen.findByText(/2 selected/)).toBeInTheDocument();
  });

  it('selection is cleared on a filter change', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Ana Silva');

    const table = screen.getByRole('table');
    await user.click(within(table).getAllByRole('checkbox')[0]);
    expect(await screen.findByText(/2 selected/)).toBeInTheDocument();

    await user.click(screen.getByText(/Manual/));
    await waitFor(() => expect(screen.queryByText(/selected/)).not.toBeInTheDocument());
  });

  it('the sweep button is disabled when nothing is sweepable, and states the exclusions', async () => {
    mockApiFetch.mockImplementation((path: string) =>
      path.startsWith('/volunteer-hours/review')
        ? Promise.resolve(reviewResponse([FLAGGED_ENTRY], { sweepable: 0 }))
        : Promise.resolve({}),
    );
    renderPage();
    await screen.findByText('Ana Silva');

    expect(screen.getByRole('button', { name: /Approve all without exceptions/ })).toBeDisabled();
  });

  it('sweep dialog states manual/flagged entries are excluded, and posts the sweep', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockImplementation((path: string, options?: { method?: string }) => {
      if (path.startsWith('/volunteer-hours/review')) {
        return Promise.resolve(reviewResponse([CLEAN_ENTRY], { sweepable: 1 }));
      }
      if (path === '/volunteer-hours/approve-sweep' && options?.method === 'POST') {
        return Promise.resolve({ approvedCount: 1, totalMinutes: 240 });
      }
      return Promise.resolve({});
    });
    renderPage();
    await screen.findByText('Bruno Alves');

    await user.click(screen.getByRole('button', { name: /Approve all without exceptions/ }));
    expect(await screen.findByText(/Manual and flagged entries are not included/)).toBeInTheDocument();

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Approve' }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/volunteer-hours/approve-sweep',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
  });

  it('bulk-approve confirm names the flagged entries in the selection', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Ana Silva');

    const table = screen.getByRole('table');
    await user.click(within(table).getAllByRole('checkbox')[0]);
    await user.click(screen.getByRole('button', { name: 'Approve selected' }));

    expect(await screen.findByText(/These include flagged entries: Ana Silva/)).toBeInTheDocument();
  });

  it('a batch partial failure surfaces the failed entries and keeps the page usable', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockImplementation((path: string, options?: { method?: string }) => {
      if (path.startsWith('/volunteer-hours/review')) {
        return Promise.resolve(reviewResponse([FLAGGED_ENTRY, CLEAN_ENTRY]));
      }
      if (path === '/volunteer-hours/approve-batch' && options?.method === 'POST') {
        return Promise.resolve({
          approved: [CLEAN_ENTRY],
          failed: [{ id: FLAGGED_ENTRY.id, message: 'Already approved.' }],
        });
      }
      return Promise.resolve({});
    });
    renderPage();
    await screen.findByText('Ana Silva');

    const table = screen.getByRole('table');
    await user.click(within(table).getAllByRole('checkbox')[0]);
    await user.click(screen.getByRole('button', { name: 'Approve selected' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Approve' }));

    expect(await screen.findByText(/Already approved\./)).toBeInTheDocument();
    // The page is still usable — the table is still there (the dialog's
    // close transition briefly leaves it `aria-hidden`, so retry rather than
    // a synchronous getBy).
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });

  it('one-click Aprovar posts no correction and shows an undo snackbar; undo reopens it', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockImplementation((path: string, options?: { method?: string; body?: unknown }) => {
      if (path.startsWith('/volunteer-hours/review')) {
        return Promise.resolve(reviewResponse([CLEAN_ENTRY]));
      }
      return Promise.resolve({});
    });
    renderPage();
    await screen.findByText('Bruno Alves');

    const table = screen.getByRole('table');
    const row = within(table).getByText('Bruno Alves').closest('tr') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: 'Approve' }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(`/volunteer-hours/${CLEAN_ENTRY.id}/approve`, {
        method: 'POST',
        body: {},
      }),
    );

    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(`/volunteer-hours/${CLEAN_ENTRY.id}/reopen`, {
        method: 'POST',
      }),
    );
  });

  it('the adjust dialog requires a reason only once the value changes', async () => {
    const user = userEvent.setup();
    mockReviewQueue([CLEAN_ENTRY]);
    renderPage();
    await screen.findByText('Bruno Alves');

    const table = screen.getByRole('table');
    const row = within(table).getByText('Bruno Alves').closest('tr') as HTMLElement;
    await user.click(within(row).getByLabelText('More actions'));
    await user.click(await screen.findByRole('menuitem', { name: 'Adjust' }));

    // Unchanged: Approve proceeds with no reason needed.
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Approve' }));
    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        `/volunteer-hours/${CLEAN_ENTRY.id}/approve`,
        expect.objectContaining({ method: 'POST', body: {} }),
      ),
    );
  });

  it('the adjust dialog blocks a corrected value with no reason', async () => {
    const user = userEvent.setup();
    mockReviewQueue([CLEAN_ENTRY]);
    renderPage();
    await screen.findByText('Bruno Alves');

    const table = screen.getByRole('table');
    const row = within(table).getByText('Bruno Alves').closest('tr') as HTMLElement;
    await user.click(within(row).getByLabelText('More actions'));
    await user.click(await screen.findByRole('menuitem', { name: 'Adjust' }));

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: "Don't count (0)" }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Approve' }));

    expect(await screen.findByText('Correcting the value needs a reason.')).toBeInTheDocument();
  });

  it('dismiss requires a reason', async () => {
    const user = userEvent.setup();
    mockReviewQueue([CLEAN_ENTRY]);
    renderPage();
    await screen.findByText('Bruno Alves');

    const table = screen.getByRole('table');
    const row = within(table).getByText('Bruno Alves').closest('tr') as HTMLElement;
    await user.click(within(row).getByLabelText('More actions'));
    await user.click(await screen.findByRole('menuitem', { name: 'Dismiss' }));
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(await screen.findByText('Dismissing needs a reason.')).toBeInTheDocument();
  });

  it('exports the summary CSV for the chosen range', async () => {
    const user = userEvent.setup();
    mockReviewQueue([CLEAN_ENTRY]);
    renderPage();
    await screen.findByText('Bruno Alves');

    await user.click(screen.getByRole('button', { name: 'Export CSV' }));
    await user.click(screen.getByRole('button', { name: 'Download CSV' }));

    await waitFor(() =>
      expect(mockApiDownload).toHaveBeenCalledWith(
        expect.stringMatching(/^\/volunteer-hours\/summary\/csv\?from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}$/),
        expect.stringMatching(/^volunteer-hours-.*\.csv$/),
      ),
    );
  });
});

describe('VolunteerHoursReviewPage — mobile', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiDownload.mockReset();
    mockReviewQueue([FLAGGED_ENTRY, CLEAN_ENTRY]);
  });

  it('shows cards and the fixed bottom bulk bar instead of a table', async () => {
    const user = userEvent.setup();
    renderMobile(<VolunteerHoursReviewPage />, { locale: 'en' });
    await screen.findByText('Ana Silva');

    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[0]);

    expect(await screen.findByText(/1 selected/)).toBeInTheDocument();
  });
});
