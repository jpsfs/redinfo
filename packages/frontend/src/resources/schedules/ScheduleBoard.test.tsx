import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AvailabilityWindowStatus, ScheduleStatus } from '@redinfo/shared';
import { ScheduleBoard } from './ScheduleBoard';
import { apiDownload, apiFetch } from '../../api';
import { useIsMobile } from '../../hooks/useIsMobile';
import {
  ANA_PERSON,
  CLOSED_WINDOW,
  DRAFT_SCHEDULE,
  SCHEDULE_ID,
  scheduleBoard,
  scheduleCandidates,
} from '../../test/fixtures';

vi.mock('../../api', () => ({ apiFetch: vi.fn(), apiDownload: vi.fn() }));
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: vi.fn(() => false) }));

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

describe('ScheduleBoard', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiDownload.mockReset();
    mockUseIsMobile.mockReturnValue(false);
    respondWith();
  });

  it('loads the board for the schedule it is given', async () => {
    render(<ScheduleBoard scheduleId={SCHEDULE_ID} />);

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(`/schedules/${SCHEDULE_ID}/board`),
    );
  });

  // AC: "each schedule is identified by the window it belongs to (category and
  // name)".
  it('names the window it belongs to', async () => {
    render(<ScheduleBoard scheduleId={SCHEDULE_ID} />);

    expect(await screen.findByText('Emergency')).toBeInTheDocument();
    expect(screen.getByText('Emergency - October')).toBeInTheDocument();
    expect(screen.getByText('28 Sep 2026 – 5 Oct 2026')).toBeInTheDocument();
  });

  // AC: "Slots are allocated per the roles the window being scheduled defines
  // — not a fixed list".
  it('gives each of the window own roles a column, with its headcount', async () => {
    render(<ScheduleBoard scheduleId={SCHEDULE_ID} />);

    const header = (await screen.findAllByRole('columnheader')).map((cell) => cell.textContent);
    expect(header[0]).toContain('Date');
    expect(header[1]).toContain('Shift');
    expect(header[2]).toContain('Driver');
    expect(header[2]).toContain('certification required');
    expect(header[3]).toContain('Team Leader');
    expect(header[4]).toContain('Team Member');
  });

  it('falls back to one Crew column when the window defines no roles', async () => {
    respondWith(scheduleBoard({ roles: [] }));
    render(<ScheduleBoard scheduleId={SCHEDULE_ID} />);

    const header = (await screen.findAllByRole('columnheader')).map((cell) => cell.textContent);
    expect(header).toHaveLength(3);
    expect(header[2]).toContain('Crew');
  });

  it('shows who is on each shift', async () => {
    render(<ScheduleBoard scheduleId={SCHEDULE_ID} />);
    await screen.findByText('Sat, 3 Oct');

    const saturday = rowFor('Sat, 3 Oct');
    expect(within(saturday).getByText(/Ana Silva/)).toBeInTheDocument();
    expect(within(saturday).getByText(/Carla Ferreira/)).toBeInTheDocument();
  });

  // AC: "Any assignment that contradicts submitted availability is flagged as
  // an override … recording who made it and when".
  it('marks an override, and leaves an ordinary assignment unmarked', async () => {
    render(<ScheduleBoard scheduleId={SCHEDULE_ID} />);

    const override = await screen.findByLabelText('Carla Ferreira, override');
    expect(override).toBeInTheDocument();
    expect(screen.getByLabelText('Ana Silva')).toBeInTheDocument();
  });

  // AC: "Coverage gaps (unfilled required slots) are visually flagged … a role
  // left short of its people and a shift left without a driver for every
  // vehicle it needs."
  it('flags a role short of its people and a shift short of drivers', async () => {
    render(<ScheduleBoard scheduleId={SCHEDULE_ID} />);

    expect(await screen.findAllByText('Team Member: 1 person short')).not.toHaveLength(0);
    expect(screen.getAllByText('No driver for the vehicle').length).toBeGreaterThan(0);
  });

  it('shows drivers assigned against the vehicles a shift crews', async () => {
    render(<ScheduleBoard scheduleId={SCHEDULE_ID} />);

    // Saturday crews two vehicles and has one certified driver so far.
    expect(await screen.findByText('1/2')).toBeInTheDocument();
  });

  it('totals slots, gaps, overrides and conflicts', async () => {
    render(<ScheduleBoard scheduleId={SCHEDULE_ID} />);

    expect(await screen.findByText('2 / 6')).toBeInTheDocument();
    expect(screen.getByText('Shifts with gaps')).toBeInTheDocument();
    expect(screen.getByText('Overrides')).toBeInTheDocument();
  });

  // AC: "the schedule process can start before" the window closes.
  it('says when the window is still open', async () => {
    render(<ScheduleBoard scheduleId={SCHEDULE_ID} />);

    expect(await screen.findByText(/still open/i)).toBeInTheDocument();
  });

  it('does not say so once the window is closed', async () => {
    respondWith(scheduleBoard({ window: CLOSED_WINDOW }));
    render(<ScheduleBoard scheduleId={SCHEDULE_ID} />);

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
            otherWindowLabel: 'SALOP Support',
            otherLabel: '08:00–20:00',
            crossWindow: true,
          },
        ],
      }),
    );
    render(<ScheduleBoard scheduleId={SCHEDULE_ID} />);

    expect(
      await screen.findByText(/Ana Silva, Sat, 3 Oct — also on SALOP Support, 08:00–20:00/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Ana Silva, double-booked')).toBeInTheDocument();
  });

  it('opens the assign dialog for the role and shift that was clicked', async () => {
    const user = userEvent.setup();
    render(<ScheduleBoard scheduleId={SCHEDULE_ID} />);

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
    render(<ScheduleBoard scheduleId={SCHEDULE_ID} />);

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
    render(<ScheduleBoard scheduleId={SCHEDULE_ID} />);

    await user.click(await screen.findByRole('button', { name: /export csv/i }));

    expect(mockApiDownload).toHaveBeenCalledWith(
      `/schedules/${SCHEDULE_ID}/csv`,
      `schedule-${SCHEDULE_ID}.csv`,
    );
  });

  it('offers Publish on a draft and not on a published schedule', async () => {
    render(<ScheduleBoard scheduleId={SCHEDULE_ID} />);
    expect(await screen.findByRole('button', { name: /publish schedule/i })).toBeInTheDocument();
  });

  it('says a published schedule is live and still editable', async () => {
    respondWith(
      scheduleBoard({
        schedule: { ...DRAFT_SCHEDULE, status: ScheduleStatus.PUBLISHED },
        window: { ...CLOSED_WINDOW, status: AvailabilityWindowStatus.CLOSED },
      }),
    );
    render(<ScheduleBoard scheduleId={SCHEDULE_ID} />);

    expect(await screen.findByText(/assigned personnel can see their duties/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /publish schedule/i })).not.toBeInTheDocument();
  });

  it('renders day cards instead of a table on mobile', async () => {
    mockUseIsMobile.mockReturnValue(true);
    render(<ScheduleBoard scheduleId={SCHEDULE_ID} />);

    expect(await screen.findByText('Sat, 3 Oct')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('reports a failure to load rather than rendering an empty board', async () => {
    mockApiFetch.mockRejectedValue(new Error('Schedule sched-1 not found'));
    render(<ScheduleBoard scheduleId={SCHEDULE_ID} />);

    expect(await screen.findByText('Schedule sched-1 not found')).toBeInTheDocument();
  });
});
