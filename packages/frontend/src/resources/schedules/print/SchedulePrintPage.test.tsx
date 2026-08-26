import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AdminContext, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ScheduleBoardResponse } from '@redinfo/shared';
import { messages } from '../../../i18n/i18nProvider';
import { ApiError, apiFetch } from '../../../api';
import {
  ANA_PERSON,
  CARLA_PERSON,
  EMERGENCY_ROLES,
  HOLIDAY_DATE,
  HOLIDAY_NAME,
  SCHEDULE_ID,
  scheduleAssignment,
  scheduleBoard,
} from '../../../test/fixtures';
import { SchedulePrintPage } from './SchedulePrintPage';

vi.mock('../../../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../api')>()),
  apiFetch: vi.fn(),
}));

const mockApiFetch = apiFetch as unknown as Mock;

const [DRIVER_ROLE, LEADER_ROLE] = EMERGENCY_ROLES;

/**
 * A board with one ordinary shift (a driven, filled place; a filled place;
 * an unfilled one) plus a holiday shift with nobody on it — enough to
 * exercise every marking the AC asks for in a single fetch.
 */
function printBoard(): ScheduleBoardResponse {
  return scheduleBoard({
    days: [
      {
        date: '2026-10-03',
        isWeekend: true,
        isHoliday: false,
        holidayName: null,
        shifts: [
          {
            slot: 1,
            startMinute: 8 * 60,
            endMinute: 16 * 60,
            vehiclesNeeded: 1,
            label: '08:00–16:00',
            driverCount: 1,
            assignments: [
              scheduleAssignment({
                user: ANA_PERSON,
                date: '2026-10-03',
                roleId: DRIVER_ROLE.id,
                roleName: DRIVER_ROLE.name,
              }),
              scheduleAssignment({
                user: CARLA_PERSON,
                date: '2026-10-03',
                roleId: LEADER_ROLE.id,
                roleName: LEADER_ROLE.name,
              }),
            ],
            gaps: [],
          },
        ],
      },
      {
        date: HOLIDAY_DATE,
        isWeekend: false,
        isHoliday: true,
        holidayName: HOLIDAY_NAME,
        shifts: [
          {
            slot: 1,
            startMinute: 8 * 60,
            endMinute: 16 * 60,
            vehiclesNeeded: 1,
            label: '08:00–16:00',
            driverCount: 0,
            assignments: [],
            gaps: [],
          },
        ],
      },
    ],
  });
}

function renderPrintPage(locale: 'pt' | 'en' = 'en') {
  const i18nProvider = polyglotI18nProvider(messages, locale);
  return render(
    <MemoryRouter initialEntries={[`/schedules/${SCHEDULE_ID}/print`]}>
      <AdminContext dataProvider={testDataProvider()} i18nProvider={i18nProvider}>
        <Routes>
          <Route path="/schedules/:id/print" element={<SchedulePrintPage />} />
        </Routes>
      </AdminContext>
    </MemoryRouter>,
  );
}

/** The logo `<img>` has "settled" once it (or its fallback) has loaded. */
const settleLogo = () => fireEvent.load(screen.getByAltText('Cruz Vermelha Portuguesa – Delegação de Campo'));

describe('SchedulePrintPage', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    vi.spyOn(window, 'print').mockImplementation(() => undefined);
  });

  it('renders the letterhead: organisation, window label and date range', async () => {
    mockApiFetch.mockResolvedValue(printBoard());
    renderPrintPage();

    expect(await screen.findByText('Portuguese Red Cross – Campo Delegation')).toBeInTheDocument();
    expect(screen.getByText(/Emergency - October/)).toBeInTheDocument();
    expect(screen.getByText('28 Sep 2026 – 5 Oct 2026')).toBeInTheDocument();
  });

  it('renders one row per shift, with the assigned names', async () => {
    mockApiFetch.mockResolvedValue(printBoard());
    renderPrintPage();

    expect(await screen.findByText('Ana Silva')).toBeInTheDocument();
    expect(screen.getByText('Carla Ferreira')).toBeInTheDocument();
    // One header row plus one row per shift (two shifts in this fixture).
    expect(screen.getAllByRole('row')).toHaveLength(3);
  });

  it('marks a driver bold and leaves a non-driver plain — B&W-safe marker', async () => {
    mockApiFetch.mockResolvedValue(printBoard());
    renderPrintPage();

    expect(await screen.findByText('Ana Silva')).toHaveClass('is-driver');
    expect(screen.getByText('Carla Ferreira')).not.toHaveClass('is-driver');
  });

  it('shows an em-dash for an unfilled role', async () => {
    mockApiFetch.mockResolvedValue(printBoard());
    renderPrintPage();

    await screen.findByText('Ana Silva');
    // Team Member is unfilled on the Saturday shift, and every role is
    // unfilled on the (empty) holiday shift.
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(4);
  });

  it('marks a holiday row with its name and a weekend row as a weekend, both tinted for a colour print', async () => {
    mockApiFetch.mockResolvedValue(printBoard());
    renderPrintPage();

    expect(await screen.findByText(HOLIDAY_NAME)).toBeInTheDocument();
    expect(screen.getByText(/Weekend/)).toBeInTheDocument();
    expect(screen.getAllByRole('row')[1]).toHaveClass('day-weekend');
    expect(screen.getAllByRole('row')[2]).toHaveClass('day-holiday');
  });

  it('sets the document title to the window name and category, for a distinct "Save as PDF" file name', async () => {
    mockApiFetch.mockResolvedValue(printBoard());
    renderPrintPage();

    await waitFor(() => expect(document.title).toBe('Emergency - October — Emergency'));
  });

  it('prints the draft notice on a draft schedule', async () => {
    mockApiFetch.mockResolvedValue(printBoard());
    renderPrintPage();

    expect(await screen.findByText(/DRAFT/)).toBeInTheDocument();
  });

  it('fires window.print() once the board has loaded and the letterhead logo has settled', async () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    mockApiFetch.mockResolvedValue(printBoard());
    renderPrintPage();

    await screen.findByText('Ana Silva');
    expect(printSpy).not.toHaveBeenCalled();

    settleLogo();

    await waitFor(() => expect(printSpy).toHaveBeenCalledTimes(1));
  });

  it('renders the translated message for a hidden draft, not a blank page', async () => {
    mockApiFetch.mockRejectedValue(
      new ApiError('This schedule has not been published yet.', 403, 'SCHEDULE_DRAFT_NOT_VISIBLE'),
    );
    renderPrintPage();

    expect(
      await screen.findByText('This schedule has not been published yet — only coordinators can see a draft.'),
    ).toBeInTheDocument();
  });

  it('renders in Portuguese', async () => {
    mockApiFetch.mockResolvedValue(printBoard());
    renderPrintPage('pt');

    expect(await screen.findByText('Cruz Vermelha Portuguesa – Delegação de Campo')).toBeInTheDocument();
    settleLogo();
  });
});
