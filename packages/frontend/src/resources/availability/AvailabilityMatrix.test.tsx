import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AvailabilityWindowStatus, toMinuteOfDay } from '@redinfo/shared';
import { AvailabilityMatrix } from './AvailabilityMatrix';
import { apiDownload, apiFetch } from '../../api';
import { useIsMobile } from '../../hooks/useIsMobile';
import { ANA, BRUNO, CLOSED_WINDOW, matrixResponse } from '../../test/fixtures';

vi.mock('../../api', () => ({
  apiFetch: vi.fn(),
  apiDownload: vi.fn(),
}));

vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: vi.fn(() => false) }));

const mockApiFetch = apiFetch as unknown as Mock;
const mockApiDownload = apiDownload as unknown as Mock;
const mockUseIsMobile = useIsMobile as unknown as Mock;

/** The desktop table row for one date, found by its visible day label. */
function rowFor(label: string): HTMLElement {
  return screen.getByText(label).closest('tr') as HTMLElement;
}

describe('AvailabilityMatrix', () => {
  beforeEach(() => {
    mockUseIsMobile.mockReturnValue(false);
    mockApiFetch.mockResolvedValue(matrixResponse());
    mockApiDownload.mockReset();
    mockApiDownload.mockResolvedValue(undefined);
  });

  it('loads the matrix for the given window', async () => {
    render(<AvailabilityMatrix windowId="win-1" />);

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/availability/matrix?windowId=win-1'),
    );
  });

  it('loads the current window when none is named', async () => {
    render(<AvailabilityMatrix />);

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/availability/matrix'));
  });

  it('shows the window range and eligible headcount', async () => {
    render(<AvailabilityMatrix windowId="win-1" />);

    expect(
      await screen.findByText('28 Sep 2026 – 5 Oct 2026 · 5 eligible personnel'),
    ).toBeInTheDocument();
  });

  it('names the window it is showing, so two rotas cannot be confused', async () => {
    render(<AvailabilityMatrix windowId="win-1" />);

    expect(await screen.findByText('Emergency')).toBeInTheDocument();
    expect(screen.getByText('Emergency - October')).toBeInTheDocument();
  });

  // ── tri-state response tracking ──────────────────────────────────────────────

  it('summarises submitted, declined and not-yet-responded counts', async () => {
    render(<AvailabilityMatrix windowId="win-1" />);

    const submitted = (await screen.findByText('Submitted')).closest('div') as HTMLElement;
    expect(within(submitted).getByText('3')).toBeInTheDocument();

    const declined = screen.getByText('Declined').closest('div') as HTMLElement;
    expect(within(declined).getByText('1')).toBeInTheDocument();

    const pending = screen.getByText('Not yet responded').closest('div') as HTMLElement;
    expect(within(pending).getByText('1')).toBeInTheDocument();
  });

  it('lists who has not responded and who declined, by name', async () => {
    render(<AvailabilityMatrix windowId="win-1" />);

    const pendingCard = (await screen.findByText('Not yet responded (1)')).closest(
      '.MuiCard-root',
    ) as HTMLElement;
    expect(within(pendingCard).getByText('Rui Nunes')).toBeInTheDocument();

    const declinedCard = screen
      .getByText('Declined this window (1)')
      .closest('.MuiCard-root') as HTMLElement;
    expect(within(declinedCard).getByText('Marta Oliveira')).toBeInTheDocument();
  });

  it('offers a reminder affordance that is disabled until a channel exists', async () => {
    render(<AvailabilityMatrix windowId="win-1" />);

    expect(await screen.findByRole('button', { name: /send reminder/i })).toBeDisabled();
  });

  // ── coverage cells ───────────────────────────────────────────────────────────

  it('renders one column per shift slot actually in use', async () => {
    render(<AvailabilityMatrix windowId="win-1" />);

    await screen.findByText('Date');
    const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent);
    expect(headers).toEqual(['Date', '08:00–16:00', '16:00–24:00', '20:00–24:00']);
  });

  it('colours each cell from the coverage level the API computed', async () => {
    render(<AvailabilityMatrix windowId="win-1" />);
    await screen.findByText('Date');

    // Sat 3 Oct: morning 3 available / 2 drivers → green; afternoon 1/0 → red.
    const saturday = rowFor('Sat, 3 Oct');
    expect(
      within(saturday).getByLabelText('08:00–16:00: 3 available, 2 drivers, 1 vehicle needed, green'),
    ).toBeInTheDocument();
    expect(
      within(saturday).getByLabelText('16:00–24:00: 1 available, 0 drivers, 1 vehicle needed, red'),
    ).toBeInTheDocument();

    // Sun 4 Oct: 2 available / 1 driver → yellow.
    expect(
      within(rowFor('Sun, 4 Oct')).getByLabelText(
        '08:00–16:00: 2 available, 1 drivers, 1 vehicle needed, yellow',
      ),
    ).toBeInTheDocument();
  });

  it('dashes out shifts that do not exist on that day', async () => {
    render(<AvailabilityMatrix windowId="win-1" />);
    await screen.findByText('Date');

    // A workday has only the evening shift, so both weekend columns are N/A.
    const monday = rowFor('Mon, 28 Sep');
    expect(within(monday).getAllByText('—')).toHaveLength(2);
    expect(
      within(monday).getByLabelText('20:00–24:00: 4 available, 2 drivers, 1 vehicle needed, green'),
    ).toBeInTheDocument();
  });

  it('badges weekends and names the holiday', async () => {
    render(<AvailabilityMatrix windowId="win-1" />);
    await screen.findByText('Date');

    expect(within(rowFor('Sat, 3 Oct')).getByText('Weekend')).toBeInTheDocument();
    expect(
      within(rowFor('Mon, 5 Oct')).getByText('Holiday · Implantação da República'),
    ).toBeInTheDocument();
    // A holiday follows the weekend pattern: two shift cells, so only the
    // workday-evening column is N/A (a plain workday has two dashes).
    expect(within(rowFor('Mon, 5 Oct')).getAllByText('—')).toHaveLength(1);
  });

  it('drills down to the names behind a coverage figure', async () => {
    render(<AvailabilityMatrix windowId="win-1" />);
    await screen.findByText('Date');

    await userEvent.click(
      within(rowFor('Sat, 3 Oct')).getByLabelText(
        '08:00–16:00: 3 available, 2 drivers, 1 vehicle needed, green',
      ),
    );

    expect(await screen.findByText('Sat, 3 Oct · 08:00–16:00 — 3 available')).toBeInTheDocument();
    expect(screen.getByText('Ana Silva')).toBeInTheDocument();
    expect(screen.getByText('Bruno Costa')).toBeInTheDocument();
    expect(screen.getByText('Carla Ferreira')).toBeInTheDocument();
  });

  it('closes the drill-down when the same cell is clicked again', async () => {
    render(<AvailabilityMatrix windowId="win-1" />);
    await screen.findByText('Date');
    const cell = within(rowFor('Sun, 4 Oct')).getByLabelText(
      '08:00–16:00: 2 available, 1 drivers, 1 vehicle needed, yellow',
    );

    await userEvent.click(cell);
    expect(await screen.findByText('Sun, 4 Oct · 08:00–16:00 — 2 available')).toBeInTheDocument();

    await userEvent.click(cell);
    await waitFor(() =>
      expect(
        screen.queryByText('Sun, 4 Oct · 08:00–16:00 — 2 available'),
      ).not.toBeInTheDocument(),
    );
  });

  // ── window state & export ────────────────────────────────────────────────────

  it('exports the CSV for the same window, through an authenticated download', async () => {
    render(<AvailabilityMatrix windowId="win-1" />);

    await userEvent.click(await screen.findByRole('button', { name: /export csv/i }));

    expect(mockApiDownload).toHaveBeenCalledWith(
      '/availability/matrix/csv?windowId=win-1',
      'availability-win-1.csv',
    );
  });

  it('reports a failed export instead of silently doing nothing', async () => {
    mockApiDownload.mockRejectedValue(new Error('Forbidden'));

    render(<AvailabilityMatrix windowId="win-1" />);
    await userEvent.click(await screen.findByRole('button', { name: /export csv/i }));

    expect(await screen.findByText('Forbidden')).toBeInTheDocument();
  });

  it('flags a closed window as a historical view and hides the reminder button', async () => {
    mockApiFetch.mockResolvedValue(
      matrixResponse({
        window: CLOSED_WINDOW,
      }),
    );

    render(<AvailabilityMatrix windowId="win-1" />);

    expect(await screen.findByText(/historical view/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /send reminder/i })).not.toBeInTheDocument();
  });

  it('explains the shift capacity rule the colours are judged against', async () => {
    render(<AvailabilityMatrix windowId="win-1" />);

    expect(
      await screen.findByText(/holds at most 3 people, and every vehicle it needs has to have a driver/i),
    ).toBeInTheDocument();
  });

  it('surfaces a load failure instead of rendering an empty table', async () => {
    mockApiFetch.mockRejectedValue(new Error('Forbidden'));

    render(<AvailabilityMatrix windowId="win-1" />);

    expect(await screen.findByText('Forbidden')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  // ── responsive swap ──────────────────────────────────────────────────────────

  describe('on a narrow viewport', () => {
    beforeEach(() => {
      mockUseIsMobile.mockReturnValue(true);
    });

    it('swaps the table for day cards', async () => {
      render(<AvailabilityMatrix windowId="win-1" />);

      await screen.findByText('Mon, 28 Sep');
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      expect(screen.getByText('Sat, 3 Oct')).toBeInTheDocument();
    });

    it('shows the names for a shift once its day is expanded', async () => {
      render(<AvailabilityMatrix windowId="win-1" />);

      // The first day is expanded by default.
      expect(await screen.findByText('Ana Silva')).toBeInTheDocument();

      await userEvent.click(screen.getByText('Sat, 3 Oct'));

      const saturdayCard = screen.getByText('Sat, 3 Oct').closest('.MuiCard-root') as HTMLElement;
      expect(await within(saturdayCard).findByText('16:00–24:00')).toBeInTheDocument();
      // Carla is the only person available for that afternoon shift.
      expect(within(saturdayCard).getAllByText('Carla Ferreira')).toHaveLength(2);
    });

    it('keeps the same coverage counts as the desktop table', async () => {
      render(<AvailabilityMatrix windowId="win-1" />);

      expect(
        await screen.findByLabelText('20:00–24:00: 4 available, 2 drivers, 1 vehicle needed, green'),
      ).toBeInTheDocument();
    });
  });

  it('renders nothing for a window with no days rather than crashing', async () => {
    mockApiFetch.mockResolvedValue(
      matrixResponse({
        days: [],
        personnel: [],
        responseStats: { submitted: 0, declined: 0, pending: 0, total: 0 },
      }),
    );

    render(<AvailabilityMatrix windowId="win-1" />);

    expect(await screen.findByText(/0 eligible personnel/)).toBeInTheDocument();
    expect(screen.getAllByText('Nobody.')).toHaveLength(2);
  });

  it('treats a window with no status as closed for the historical banner', async () => {
    mockApiFetch.mockResolvedValue(
      matrixResponse({
        window: { ...CLOSED_WINDOW, status: 'CLOSED' as AvailabilityWindowStatus },
      }),
    );

    render(<AvailabilityMatrix windowId="win-1" />);

    expect(await screen.findByText(/historical view/i)).toBeInTheDocument();
  });

  // ── windows that define their own shift times ───────────────────────────────
  //
  // A window carries its own grid, so the columns are whatever hours it uses
  // and the same slot number means different hours on different days.

  describe('with per-day shift times', () => {
    const cell = (
      slot: number,
      startHour: number,
      endHour: number,
      availableUserIds: string[] = [],
      vehiclesNeeded = 1,
    ) => ({
      slot,
      startMinute: toMinuteOfDay(startHour),
      endMinute: toMinuteOfDay(endHour),
      vehiclesNeeded,
      label: `${String(startHour).padStart(2, '0')}:00–${String(endHour).padStart(2, '0')}:00`,
      availableCount: availableUserIds.length,
      driverCount: 0,
      coverageLevel: 'red' as const,
      availableUserIds,
    });

    const day = (date: string, shifts: ReturnType<typeof cell>[]) => ({
      date,
      isWeekend: false,
      isHoliday: false,
      holidayName: null,
      shifts,
    });

    it('takes its columns from the hours the window actually uses', async () => {
      mockApiFetch.mockResolvedValue(
        matrixResponse({
          days: [
            day('2026-09-28', [cell(1, 6, 12), cell(2, 12, 18)]),
            day('2026-09-29', [cell(1, 10, 14)]),
          ],
        }),
      );

      render(<AvailabilityMatrix windowId="win-1" />);

      await screen.findByText('Date');
      expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual(
        ['Date', '06:00–12:00', '10:00–14:00', '12:00–18:00'],
      );
    });

    it('lines cells up by hours rather than by slot number', async () => {
      mockApiFetch.mockResolvedValue(
        matrixResponse({
          days: [
            day('2026-09-28', [cell(1, 6, 12), cell(2, 12, 18)]),
            // Slot 1 here is the *later* shift, so it belongs in the other column.
            day('2026-09-29', [cell(1, 12, 18, [ANA.id])]),
          ],
        }),
      );

      render(<AvailabilityMatrix windowId="win-1" />);
      await screen.findByText('Date');

      const tuesday = rowFor('Tue, 29 Sep');
      expect(within(tuesday).getAllByText('—')).toHaveLength(1);
      expect(
        within(tuesday).getByLabelText('12:00–18:00: 1 available, 0 drivers, 1 vehicle needed, red'),
      ).toBeInTheDocument();
    });

    it('drills down on the right shift when two days share a slot number', async () => {
      mockApiFetch.mockResolvedValue(
        matrixResponse({
          days: [
            day('2026-09-28', [cell(1, 6, 12, [BRUNO.id])]),
            day('2026-09-29', [cell(1, 12, 18, [ANA.id])]),
          ],
        }),
      );

      render(<AvailabilityMatrix windowId="win-1" />);
      await screen.findByText('Date');

      await userEvent.click(
        within(rowFor('Tue, 29 Sep')).getByLabelText(
          '12:00–18:00: 1 available, 0 drivers, 1 vehicle needed, red',
        ),
      );

      expect(await screen.findByText(/Tue, 29 Sep · 12:00–18:00/)).toBeInTheDocument();
      expect(screen.getByText('Ana Silva')).toBeInTheDocument();
    });

    it('shows the drivers available against the vehicles the shift needs', async () => {
      mockApiFetch.mockResolvedValue(
        matrixResponse({
          days: [
            day('2026-09-28', [
              // Two drivers for three vehicles: short, and it has to look it.
              { ...cell(1, 6, 12, [ANA.id, BRUNO.id], 3), driverCount: 2 },
            ]),
          ],
        }),
      );

      render(<AvailabilityMatrix windowId="win-1" />);
      await screen.findByText('Date');

      expect(screen.getByText('2/3')).toBeInTheDocument();
      expect(
        screen.getByLabelText(
          '06:00–12:00: 2 available, 2 drivers, 3 vehicles needed, red',
        ),
      ).toBeInTheDocument();
    });

    it('says so when a shift needs no vehicle at all', async () => {
      mockApiFetch.mockResolvedValue(
        matrixResponse({
          days: [day('2026-09-28', [cell(1, 6, 12, [ANA.id, BRUNO.id], 0)])],
        }),
      );

      render(<AvailabilityMatrix windowId="win-1" />);
      await screen.findByText('Date');

      expect(
        screen.getByLabelText(
          '06:00–12:00: 2 available, 0 drivers, no vehicle needed, red',
        ),
      ).toBeInTheDocument();
    });

    it('swaps to day cards when the window has more shift times than fit', async () => {
      mockApiFetch.mockResolvedValue(
        matrixResponse({
          days: [
            day('2026-09-28', [
              cell(1, 0, 3),
              cell(2, 3, 6),
              cell(3, 6, 9),
              cell(4, 9, 12),
              cell(5, 12, 15),
              cell(6, 15, 18),
            ]),
            day('2026-09-29', [cell(1, 18, 21)]),
          ],
        }),
      );

      render(<AvailabilityMatrix windowId="win-1" />);

      expect(await screen.findByText('Mon, 28 Sep')).toBeInTheDocument();
      expect(screen.queryByRole('columnheader')).not.toBeInTheDocument();
    });
  });
});
