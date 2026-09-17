import { afterAll, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminContext, Notification, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import { StaffAbsenceKind } from '@redinfo/shared';
import { messages } from '../i18n/i18nProvider';
import { StaffAbsencesPage } from './StaffAbsencesPage';
import { apiFetch } from '../api';
import { useIsMobile } from '../hooks/useIsMobile';

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  apiFetch: vi.fn(),
}));

vi.mock('../hooks/useIsMobile', () => ({ useIsMobile: vi.fn(() => false) }));

const mockApiFetch = apiFetch as unknown as Mock;
const mockUseIsMobile = useIsMobile as unknown as Mock;

const i18nProvider = polyglotI18nProvider(messages, 'en');

const ANA = { id: 'u-ana', firstName: 'Ana', lastName: 'Silva' };
const BRUNO = { id: 'u-bruno', firstName: 'Bruno', lastName: 'Costa' };

const ABSENCE = {
  id: 'abs-1',
  userId: ANA.id,
  kind: StaffAbsenceKind.VACATION,
  startDate: '2026-10-05',
  endDate: '2026-10-07',
  notes: 'Beach week',
  createdById: 'u-coord',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

const PARTIAL_ABSENCE = {
  id: 'abs-2',
  userId: BRUNO.id,
  kind: StaffAbsenceKind.OTHER_PAID_LEAVE,
  startDate: '2026-10-12',
  endDate: '2026-10-12',
  startTime: '09:00',
  endTime: '11:00',
  notes: 'Blood donation',
  createdById: 'u-coord',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

/** October 2026: the 3rd is a Saturday, the 5th a made-up named holiday. */
const OCT_CALENDAR = [
  { date: '2026-10-03', isWeekend: true, isHoliday: false, holidayName: null, shifts: [] },
  { date: '2026-10-04', isWeekend: true, isHoliday: false, holidayName: null, shifts: [] },
  { date: '2026-10-05', isWeekend: false, isHoliday: true, holidayName: 'Implantação da República', shifts: [] },
];

function stubApi({
  people = [ANA, BRUNO],
  absences = [ABSENCE] as unknown[],
  calendar = OCT_CALENDAR as unknown[],
} = {}) {
  mockApiFetch.mockImplementation((path: string, options?: { method?: string }) => {
    if (path.startsWith('/users')) return Promise.resolve({ data: people, total: people.length });
    if (path.startsWith('/availability/calendar')) return Promise.resolve(calendar);
    if (path.startsWith('/staff-absences') && (!options?.method || options.method === 'GET')) {
      return Promise.resolve(absences);
    }
    return Promise.resolve({});
  });
}

// Fixed "today" so the default visible month (and the absence fixture dates,
// which fall inside it) are deterministic. Only `Date` is faked — faking
// timers too would freeze the polling `waitFor`/`findBy*` rely on.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-15T09:00:00.000Z'));
});
afterAll(() => vi.useRealTimers());

const renderPage = () =>
  render(
    <AdminContext dataProvider={testDataProvider()} i18nProvider={i18nProvider}>
      <StaffAbsencesPage />
      <Notification />
    </AdminContext>,
  );

describe('StaffAbsencesPage', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockUseIsMobile.mockReturnValue(false);
    stubApi();
  });

  it('loads the visible month range and lists every person as a row', async () => {
    renderPage();

    await screen.findByText('Ana Silva');
    expect(screen.getByText('Bruno Costa')).toBeInTheDocument();

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/staff-absences?from=2026-10-01&to=2026-10-31'),
    );
  });

  it('says so when there is no staff to show', async () => {
    stubApi({ people: [] });
    renderPage();

    expect(await screen.findByText('No staff to show.')).toBeInTheDocument();
  });

  it('shows an absence already on file, coloured by kind', async () => {
    renderPage();
    await screen.findByText('Ana Silva');

    const cell = screen.getByTestId(`absence-cell-${ANA.id}-2026-10-06`);
    await userEvent.hover(cell);
    expect(await screen.findByText(/Vacation.*Beach week/)).toBeInTheDocument();
  });

  it('shows the time range in the tooltip for a partial-day absence', async () => {
    stubApi({ absences: [ABSENCE, PARTIAL_ABSENCE] });
    renderPage();
    await screen.findByText('Bruno Costa');

    const cell = screen.getByTestId(`absence-cell-${BRUNO.id}-2026-10-12`);
    await userEvent.hover(cell);
    expect(await screen.findByText(/09:00–11:00.*Blood donation/)).toBeInTheDocument();
  });

  it('flags a named holiday in the header', async () => {
    renderPage();
    await screen.findByText('Ana Silva');

    expect(await screen.findByTitle('Holiday · Implantação da República')).toBeInTheDocument();
  });

  it('opens the edit dialog on an existing block, and deleting it calls the API', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Ana Silva');

    await user.click(screen.getByTestId(`absence-cell-${ANA.id}-2026-10-06`));

    expect(await screen.findByText('Edit absence')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /delete absence/i }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/staff-absences/abs-1', expect.objectContaining({ method: 'DELETE' })),
    );
  });

  it('two clicks on empty days in the same row propose that range for a new absence', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Bruno Costa');

    await user.click(screen.getByTestId(`absence-cell-${BRUNO.id}-2026-10-12`));
    expect(screen.getByText('Now click the last day of the absence (or click it again to cancel).')).toBeInTheDocument();
    await user.click(screen.getByTestId(`absence-cell-${BRUNO.id}-2026-10-10`));

    expect(await screen.findByText('Record absence')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2026-10-10')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2026-10-12')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/staff-absences',
        expect.objectContaining({
          method: 'POST',
          body: expect.objectContaining({
            userId: BRUNO.id,
            startDate: '2026-10-10',
            endDate: '2026-10-12',
          }),
        }),
      ),
    );
  });

  it('clicking the anchor cell again cancels the pending selection', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Bruno Costa');

    const cell = screen.getByTestId(`absence-cell-${BRUNO.id}-2026-10-10`);
    await user.click(cell);
    await user.click(cell);

    expect(screen.queryByText('Record absence')).not.toBeInTheDocument();
  });

  it('clicking a different row restarts the selection there instead of erroring', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Bruno Costa');

    await user.click(screen.getByTestId(`absence-cell-${ANA.id}-2026-10-10`));
    await user.click(screen.getByTestId(`absence-cell-${BRUNO.id}-2026-10-12`));
    await user.click(screen.getByTestId(`absence-cell-${BRUNO.id}-2026-10-14`));

    expect(await screen.findByText('Record absence')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2026-10-12')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2026-10-14')).toBeInTheDocument();
  });

  it('the Add absence button opens a dialog with a person picker', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Ana Silva');

    await user.click(screen.getByRole('button', { name: /^add absence$/i }));

    expect(await screen.findByText('Record absence')).toBeInTheDocument();
    expect(screen.getByLabelText('Person')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/staff-absences',
        expect.objectContaining({ method: 'POST', body: expect.objectContaining({ userId: ANA.id }) }),
      ),
    );
  });

  it('stepping the month reloads absences for the new range', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Ana Silva');

    await user.click(screen.getByLabelText('Next month'));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/staff-absences?from=2026-11-01&to=2026-11-30'),
    );
  });

  describe('on mobile', () => {
    beforeEach(() => mockUseIsMobile.mockReturnValue(true));

    it('shows each person as a card with their absences as chips, not a grid', async () => {
      renderPage();
      await screen.findByText('Ana Silva');

      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Vacation/ })).toBeInTheDocument();
      expect(screen.getByText('No absences this month.')).toBeInTheDocument(); // Bruno has none
    });

    it("tapping a person's + opens the add dialog preset to them", async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Bruno Costa');

      await user.click(screen.getByRole('button', { name: 'Add absence: Bruno Costa' }));

      expect(await screen.findByText('Record absence')).toBeInTheDocument();
      expect(screen.getByText('Person: Bruno Costa')).toBeInTheDocument();
      expect(screen.queryByLabelText('Person')).not.toBeInTheDocument();
    });

    it('tapping an absence chip opens the edit dialog', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Ana Silva');

      await user.click(screen.getByRole('button', { name: /Vacation/ }));

      expect(await screen.findByText('Edit absence')).toBeInTheDocument();
    });

    it("shows a partial-day absence's chip with its time range", async () => {
      stubApi({ absences: [ABSENCE, PARTIAL_ABSENCE] });
      renderPage();
      await screen.findByText('Bruno Costa');

      expect(screen.getByRole('button', { name: /09:00–11:00/ })).toBeInTheDocument();
    });
  });
});
