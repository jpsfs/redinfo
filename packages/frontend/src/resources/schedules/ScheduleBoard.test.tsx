import { afterAll, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminContext, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import { MemoryRouter } from 'react-router-dom';
import { AvailabilityWindowStatus, CertificationType, ScheduleStatus, UserRole } from '@redinfo/shared';
import { messages } from '../../i18n/i18nProvider';
import { ScheduleBoard } from './ScheduleBoard';
import { apiDownload, apiFetch } from '../../api';
import { useIsMobile } from '../../hooks/useIsMobile';
import {
  ANA_PERSON,
  CLOSED_WINDOW,
  DRAFT_SCHEDULE,
  EMERGENCY_ROLES,
  SCHEDULE_ID,
  scheduleBoard,
  scheduleCandidates,
} from '../../test/fixtures';

// Partial mock — the real `ApiError` comes through (needed by the
// assign/publish/sign-up dialogs this board renders, which check
// `instanceof ApiError` in their own catch blocks), only `apiFetch`/
// `apiDownload` are replaced.
vi.mock('../../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api')>()),
  apiFetch: vi.fn(),
  apiDownload: vi.fn(),
}));
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: vi.fn(() => false) }));

/**
 * The board judges a shift against today — a member cannot sign up to one that
 * has already happened (`selfAssignBlockedReason`). The fixtures below are
 * dated October 2026, so without pinning "today" this suite would start
 * failing on a calendar date rather than on a change. Only `Date` is faked;
 * `userEvent` needs the real timers underneath it.
 */
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-01T09:00:00.000Z'));
});
afterAll(() => vi.useRealTimers());

const mockApiFetch = apiFetch as unknown as Mock;
const mockApiDownload = apiDownload as unknown as Mock;
const mockUseIsMobile = useIsMobile as unknown as Mock;

/** Route the board's reads by path, so a test only states what it changes. */
function respondWith(board = scheduleBoard(), candidates = scheduleCandidates()) {
  mockApiFetch.mockImplementation((path: string) => {
    if (path.includes('/board')) return Promise.resolve(board);
    if (path.includes('/candidates')) return Promise.resolve(candidates);
    return Promise.resolve({});
  });
}

const rowFor = (label: string): HTMLElement =>
  screen.getByText(label).closest('tr') as HTMLElement;

const COORDINATOR = {
  roles: [UserRole.EMERGENCY_COORDINATOR],
  identity: { id: 'u-coord', fullName: 'Maria Santos', isDriver: false, certifications: [] },
};
const MEMBER = {
  roles: [UserRole.EMERGENCY_OPERATIONAL],
  identity: { id: 'u-rui', fullName: 'Rui Nunes', isDriver: false, certifications: [] },
};
const DRIVING_MEMBER = {
  roles: [UserRole.EMERGENCY_OPERATIONAL],
  identity: {
    id: 'u-bruno',
    fullName: 'Bruno Costa',
    isDriver: true,
    certifications: [{ type: CertificationType.DRIVER, validUntil: null }],
  },
};

// This screen has not gone through #180 phase 3 yet — English by convention.
const i18nProvider = polyglotI18nProvider(messages, 'en');

/**
 * The board reads who is looking at it from react-admin, so every render goes
 * through an AdminContext carrying that person's role and identity.
 */
function renderBoard(as: { roles: UserRole[]; identity: Record<string, unknown> } = COORDINATOR) {
  const authProvider = {
    login: () => Promise.resolve(),
    logout: () => Promise.resolve(),
    checkAuth: () => Promise.resolve(),
    checkError: () => Promise.resolve(),
    getPermissions: () => Promise.resolve(as.roles),
    getIdentity: () => Promise.resolve(as.identity as never),
  };
  return render(
    <MemoryRouter>
      <AdminContext dataProvider={testDataProvider()} authProvider={authProvider} i18nProvider={i18nProvider}>
        <ScheduleBoard scheduleId={SCHEDULE_ID} />
      </AdminContext>
    </MemoryRouter>,
  );
}

describe('ScheduleBoard', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiDownload.mockReset();
    mockUseIsMobile.mockReturnValue(false);
    respondWith();
  });

  it('loads the board for the schedule it is given', async () => {
    renderBoard();

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(`/schedules/${SCHEDULE_ID}/board`),
    );
  });

  // AC: "each schedule is identified by the window it belongs to (category and
  // name)".
  it('names the window it belongs to', async () => {
    renderBoard();

    expect(await screen.findByText('Emergency')).toBeInTheDocument();
    expect(screen.getByText('Emergency - October')).toBeInTheDocument();
    expect(screen.getByText('28 Sep 2026 – 5 Oct 2026')).toBeInTheDocument();
  });

  // AC: "Slots are allocated per the roles the window being scheduled defines
  // — not a fixed list".
  it('gives each of the window own roles a column, with its headcount', async () => {
    renderBoard();

    const header = (await screen.findAllByRole('columnheader')).map((cell) => cell.textContent);
    expect(header[0]).toContain('Date');
    expect(header[1]).toContain('Shift');
    expect(header[2]).toContain('Driver');
    expect(header[2]).toContain('Driver required');
    expect(header[3]).toContain('Team Leader');
    expect(header[4]).toContain('Team Member');
  });

  it('falls back to one Crew column when the window defines no roles', async () => {
    respondWith(scheduleBoard({ roles: [] }));
    renderBoard();

    const header = (await screen.findAllByRole('columnheader')).map((cell) => cell.textContent);
    expect(header).toHaveLength(3);
    expect(header[2]).toContain('Crew');
  });

  it('shows who is on each shift', async () => {
    renderBoard();
    await screen.findByText('Sat, 3 Oct');

    const saturday = rowFor('Sat, 3 Oct');
    expect(within(saturday).getByText(/Ana Silva/)).toBeInTheDocument();
    expect(within(saturday).getByText(/Carla Ferreira/)).toBeInTheDocument();
  });

  // AC: "Any assignment that contradicts submitted availability is flagged as
  // an override … recording who made it and when".
  it('marks an override, and leaves an ordinary assignment unmarked', async () => {
    renderBoard();

    const override = await screen.findByLabelText('Carla Ferreira, override');
    expect(override).toBeInTheDocument();
    expect(screen.getByLabelText('Ana Silva')).toBeInTheDocument();
  });

  // AC: "Coverage gaps (unfilled required slots) are visually flagged … a role
  // left short of its people". The empty places are the flag: a role wanting
  // three people shows three of them, and one filled to its headcount shows
  // none — said more directly than a sentence saying so.
  it('shows one open place per person a role still wants', async () => {
    const pool = { ...EMERGENCY_ROLES[2], maxPeople: 3 };
    respondWith(scheduleBoard({ roles: [pool] }));
    renderBoard();

    // Sunday's shift is empty, so all three of its places are open — and only
    // three: the count comes down as people fill them.
    await screen.findByText('Sun, 4 Oct');
    const sunday = rowFor('Sun, 4 Oct');
    const places = within(sunday).getAllByLabelText(
      /Assign to Team Member on Sun, 4 Oct, 08:00–16:00 — place \d of 3/,
    );
    expect(places).toHaveLength(3);
    expect(within(sunday).queryByLabelText(/place 4 of/)).not.toBeInTheDocument();
  });

  it('offers no open place on a role already filled to its headcount', async () => {
    renderBoard();
    await screen.findByText('Sat, 3 Oct');

    // Ana holds the single Driver place on Saturday; Sunday's is still open.
    expect(
      screen.queryByLabelText('Assign to Driver on Sat, 3 Oct, 08:00–16:00'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByLabelText('Assign to Driver on Sun, 4 Oct, 08:00–16:00'),
    ).toBeInTheDocument();
  });

  it('does not repeat a short role in words under every column', async () => {
    renderBoard();
    await screen.findByText('Sat, 3 Oct');

    expect(screen.queryByText(/person short/)).not.toBeInTheDocument();
    expect(screen.queryByText(/people short/)).not.toBeInTheDocument();
  });

  // AC: "a shift left without a driver for every vehicle it needs". The empty
  // places cannot express this one — a shift can be full to every role and
  // still have nobody able to drive — so it stays written out.
  it('still writes out a shift with nobody who can drive', async () => {
    renderBoard();

    expect(
      (await screen.findAllByText('No driver for the vehicle')).length,
    ).toBeGreaterThan(0);
  });

  it('shows the shift as its time range alone, with no driver counter', async () => {
    renderBoard();
    await screen.findByText('Sat, 3 Oct');

    const saturday = rowFor('Sat, 3 Oct');
    const shiftCell = within(saturday).getAllByRole('cell')[1];
    expect(shiftCell).toHaveTextContent('08:00–16:00');
    // Saturday crews two vehicles with one driver on it; neither number is
    // spelled out here — the Driver column is where that is read.
    expect(shiftCell).not.toHaveTextContent('1/2');
    expect(shiftCell.textContent?.trim()).toBe('08:00–16:00');
  });

  it('opens the adjust-shift dialog when a coordinator clicks the shift', async () => {
    renderBoard();
    const user = userEvent.setup();
    await screen.findByText('Sat, 3 Oct');

    await user.click(screen.getByRole('button', { name: /Adjust the hours of Sat, 3 Oct/ }));

    expect(await screen.findByText('Adjust shift hours')).toBeInTheDocument();
  });

  it('marks an adjusted shift with the window\'s own hours, and re-reads the board on save', async () => {
    const board = scheduleBoard();
    board.days[0].shifts[0] = {
      ...board.days[0].shifts[0],
      startMinute: 7 * 60,
      endMinute: 16 * 60,
      label: '07:00–16:00',
      adjustment: {
        original: { startMinute: 8 * 60, endMinute: 16 * 60 },
        adjustedBy: null,
        adjustedAt: '2026-09-20T10:00:00.000Z',
      },
    };
    respondWith(board);
    renderBoard();
    const user = userEvent.setup();
    await screen.findByText('Sat, 3 Oct');

    expect(screen.getByText('07:00–16:00')).toBeInTheDocument();
    expect(screen.getByText('was 08:00–16:00')).toBeInTheDocument();

    mockApiFetch.mockClear();
    await user.click(screen.getByRole('button', { name: /Adjust the hours of Sat, 3 Oct/ }));
    await user.click(await screen.findByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/schedules/${SCHEDULE_ID}/board`),
      ),
    );
  });

  it('totals slots, gaps, overrides and conflicts', async () => {
    renderBoard();

    expect(await screen.findByText('2 / 6')).toBeInTheDocument();
    expect(screen.getByText('Shifts with gaps')).toBeInTheDocument();
    expect(screen.getByText('Overrides')).toBeInTheDocument();
  });

  // AC: "the schedule process can start before" the window closes.
  it('says when the window is still open', async () => {
    renderBoard();

    expect(await screen.findByText(/still open/i)).toBeInTheDocument();
  });

  it('does not say so once the window is closed', async () => {
    respondWith(scheduleBoard({ window: CLOSED_WINDOW }));
    renderBoard();

    await screen.findByText('Schedule');
    expect(screen.queryByText(/still open/i)).not.toBeInTheDocument();
  });

  // AC: "Double-booking conflicts … including across two different windows
  // whose dates overlap".
  it('spells out a double-booking against the other window', async () => {
    respondWith(
      scheduleBoard({
        conflicts: [
          {
            userId: ANA_PERSON.id,
            userName: 'Ana Silva',
            date: '2026-10-03',
            slot: 1,
            otherWindowId: 'win-2',
            otherWindowLabel: 'CNE Support',
            otherLabel: '08:00–20:00',
            crossWindow: true,
          },
        ],
      }),
    );
    renderBoard();

    expect(
      await screen.findByText(/Ana Silva, Sat, 3 Oct — also on CNE Support, 08:00–20:00/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Ana Silva, double-booked')).toBeInTheDocument();
  });

  it('opens the assign dialog for the role and shift that was clicked', async () => {
    const user = userEvent.setup();
    renderBoard();

    await user.click(
      await screen.findByLabelText('Assign to Team Member on Sat, 3 Oct, 08:00–16:00'),
    );

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.stringContaining('/candidates?date=2026-10-03&slot=1&roleId=role-3'),
      ),
    );
  });

  it('removes an assignment and reloads', async () => {
    const user = userEvent.setup();
    renderBoard();
    // The remove control only exists once the viewer is known to be a
    // coordinator, which resolves a tick after the board does.
    await screen.findByRole('button', { name: /auto-fill/i });

    const chip = await screen.findByLabelText('Ana Silva');
    await user.click(within(chip).getByTestId('CancelIcon'));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        `/schedules/${SCHEDULE_ID}/assignments/assign-u-ana-1`,
        { method: 'DELETE' },
      ),
    );
  });

  it('exports the roster as CSV', async () => {
    const user = userEvent.setup();
    mockApiDownload.mockResolvedValue(undefined);
    renderBoard();

    await user.click(await screen.findByRole('button', { name: /export csv/i }));

    expect(mockApiDownload).toHaveBeenCalledWith(
      `/schedules/${SCHEDULE_ID}/csv`,
      `schedule-${SCHEDULE_ID}.csv`,
    );
  });

  it('opens the print screen in a new tab, board state untouched', async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    renderBoard();

    await user.click(await screen.findByRole('button', { name: /print schedule/i }));

    expect(openSpy).toHaveBeenCalledWith(`/#/schedules/${SCHEDULE_ID}/print`, '_blank', 'noopener');
  });

  it('offers Publish on a draft and not on a published schedule', async () => {
    renderBoard();
    expect(await screen.findByRole('button', { name: /publish schedule/i })).toBeInTheDocument();
  });

  it('says a published schedule is live and still editable', async () => {
    respondWith(
      scheduleBoard({
        schedule: { ...DRAFT_SCHEDULE, status: ScheduleStatus.PUBLISHED },
        window: { ...CLOSED_WINDOW, status: AvailabilityWindowStatus.CLOSED },
      }),
    );
    renderBoard();

    expect(await screen.findByText(/members can add themselves/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /publish schedule/i })).not.toBeInTheDocument();
  });

  it('renders day cards instead of a table on mobile', async () => {
    mockUseIsMobile.mockReturnValue(true);
    renderBoard();

    expect(await screen.findByText('Sat, 3 Oct')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('reports a failure to load rather than rendering an empty board', async () => {
    mockApiFetch.mockRejectedValue(new Error('Schedule sched-1 not found'));
    renderBoard();

    expect(await screen.findByText('Schedule sched-1 not found')).toBeInTheDocument();
  });
});

// ── What a member sees on a published rota ─────────────────────────────────────
//
// A published schedule is posted to the whole platform. Anyone may add
// themselves to an open place they can cover; nobody may take themselves — or
// anyone else — off it.

describe('ScheduleBoard as a member', () => {
  const publishedBoard = (overrides = {}) =>
    scheduleBoard({
      schedule: { ...DRAFT_SCHEDULE, status: ScheduleStatus.PUBLISHED },
      window: CLOSED_WINDOW,
      ...overrides,
    });

  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiDownload.mockReset();
    mockUseIsMobile.mockReturnValue(false);
    respondWith(publishedBoard());
  });

  it('offers no coordinator tools', async () => {
    renderBoard(MEMBER);

    await screen.findByText('Sat, 3 Oct');
    expect(screen.queryByRole('button', { name: /auto-fill/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /publish/i })).not.toBeInTheDocument();
  });

  it('shows the shift as plain text, not something to click', async () => {
    renderBoard(MEMBER);
    await screen.findByText('Sat, 3 Oct');

    expect(screen.queryByRole('button', { name: /Adjust the hours/ })).not.toBeInTheDocument();
    expect(screen.getAllByText('08:00–16:00').length).toBeGreaterThan(0);
  });

  it('will not let a member take anyone off a shift, themselves included', async () => {
    renderBoard(MEMBER);

    const chip = await screen.findByLabelText(/Carla Ferreira/);
    expect(within(chip).queryByTestId('CancelIcon')).not.toBeInTheDocument();
    expect(screen.getByText(/you cannot take yourself off/i)).toBeInTheDocument();
  });

  it('offers an open place as "Add me" rather than "Assign"', async () => {
    renderBoard(MEMBER);

    expect(
      await screen.findByLabelText('Add me to Team Member on Sat, 3 Oct, 08:00–16:00'),
    ).toBeEnabled();
    expect(screen.queryByLabelText(/^Assign to/)).not.toBeInTheDocument();
  });

  // The rule that cannot be waived, applied before the request is ever made.
  it('will not offer the driver post to someone without the certification', async () => {
    renderBoard(MEMBER);

    const driverSlot = await screen.findByLabelText(
      'Add me to Driver on Sun, 4 Oct, 08:00–16:00',
    );
    expect(driverSlot).toBeDisabled();
  });

  it('offers the driver post to a certified driver', async () => {
    renderBoard(DRIVING_MEMBER);

    // Re-queried each time: the button is re-rendered once the identity — and
    // with it the certification — has loaded.
    await waitFor(() =>
      expect(
        screen.getByLabelText('Add me to Driver on Sun, 4 Oct, 08:00–16:00'),
      ).toBeEnabled(),
    );
  });

  it('confirms before adding them, because it cannot be undone', async () => {
    const user = userEvent.setup();
    renderBoard(MEMBER);

    await user.click(
      await screen.findByLabelText('Add me to Team Member on Sat, 3 Oct, 08:00–16:00'),
    );

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Add yourself to this shift?')).toBeInTheDocument();
    // The same warning the board carries, restated at the point of commitment.
    expect(within(dialog).getByText(/cannot take yourself off/i)).toBeInTheDocument();
  });

  it('signs them up through the self-assign endpoint', async () => {
    const user = userEvent.setup();
    renderBoard(MEMBER);

    await user.click(
      await screen.findByLabelText('Add me to Team Member on Sat, 3 Oct, 08:00–16:00'),
    );
    await user.click(await screen.findByRole('button', { name: 'Add me' }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        `/schedules/${SCHEDULE_ID}/assignments/me`,
        { method: 'POST', body: { date: '2026-10-03', slot: 1, roleId: 'role-3' } },
      ),
    );
  });

  it('reports a refusal from the API', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockImplementation((path: string) =>
      path.includes('/board')
        ? Promise.resolve(publishedBoard())
        : Promise.reject(new Error('Team Member is already full on this shift.')),
    );
    renderBoard(MEMBER);

    await user.click(
      await screen.findByLabelText('Add me to Team Member on Sat, 3 Oct, 08:00–16:00'),
    );
    await user.click(await screen.findByRole('button', { name: 'Add me' }));

    expect(
      await screen.findByText('Team Member is already full on this shift.'),
    ).toBeInTheDocument();
  });

  // Shown but refused, the same way an uncertified driver post is: the place
  // is still the honest picture of a shift that went short, and the tooltip
  // says why it cannot be taken now.
  it('will not let anyone sign up to a shift that has already happened', async () => {
    respondWith(
      publishedBoard({
        // Two days before the pinned "today" above.
        days: [{ ...publishedBoard().days[0], date: '2026-09-29' }],
      }),
    );
    renderBoard(MEMBER);

    await screen.findByText('Tue, 29 Sep');
    const place = screen.getByLabelText('Add me to Team Member on Tue, 29 Sep, 08:00–16:00');
    expect(place).toBeDisabled();
    expect(place.closest('span')).toHaveAttribute('aria-label', 'This shift has already passed.');
  });

  it('offers nothing to sign up to while the schedule is still a draft', async () => {
    respondWith(scheduleBoard());
    renderBoard(MEMBER);

    await screen.findByText('Sat, 3 Oct');
    expect(screen.queryByLabelText(/^Add me to/)).not.toBeInTheDocument();
  });

  it('marks a self-signup as such rather than as an override', async () => {
    respondWith(
      publishedBoard({
        days: [
          {
            date: '2026-10-03',
            isWeekend: true,
            isHoliday: false,
            holidayName: null,
            shifts: [
              {
                ...publishedBoard().days[0].shifts[0],
                assignments: [
                  {
                    ...publishedBoard().days[0].shifts[0].assignments[1],
                    selfAssigned: true,
                    assignedById: 'u-carla',
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
    renderBoard(MEMBER);

    expect(await screen.findByLabelText(/Carla Ferreira, signed up/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/override/)).not.toBeInTheDocument();
  });
});
