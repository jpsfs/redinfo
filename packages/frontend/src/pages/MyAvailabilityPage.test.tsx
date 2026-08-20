import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminContext, Notification, testDataProvider } from 'react-admin';
import { ShiftCode } from '@redinfo/shared';
import { MyAvailabilityPage } from './MyAvailabilityPage';
import { apiFetch } from '../api';
import { useIsMobile } from '../hooks/useIsMobile';
import {
  CLOSED_WINDOW,
  calendarFor,
  myAvailability,
  WINDOW_END,
  WINDOW_START,
} from '../test/fixtures';

vi.mock('../api', () => ({
  apiFetch: vi.fn(),
  apiDownload: vi.fn(),
}));

vi.mock('../hooks/useIsMobile', () => ({ useIsMobile: vi.fn(() => false) }));

const mockApiFetch = apiFetch as unknown as Mock;
const mockUseIsMobile = useIsMobile as unknown as Mock;

/**
 * Route the mocked client by path: the page loads its own state from
 * `/availability/me` and the month preview from `/availability/calendar`.
 */
function stubApi(
  handlers: {
    me?: unknown;
    onPut?: (body: unknown) => unknown;
    onDecline?: (method: string) => unknown;
  } = {},
) {
  const me = handlers.me ?? myAvailability();
  mockApiFetch.mockImplementation(
    (path: string, options?: { method?: string; body?: unknown }) => {
      if (path.startsWith('/availability/calendar')) {
        const from = new URL(`http://x${path}`).searchParams.get('from')!;
        const to = new URL(`http://x${path}`).searchParams.get('to')!;
        return Promise.resolve(calendarFor(from, to));
      }
      if (path === '/availability/me/decline') {
        return Promise.resolve(handlers.onDecline?.(options?.method ?? 'POST') ?? me);
      }
      if (path === '/availability/me' && options?.method === 'PUT') {
        return Promise.resolve(handlers.onPut?.(options.body) ?? me);
      }
      return Promise.resolve(me);
    },
  );
}

/** `Notification` is rendered so `useNotify` messages are assertable. */
const renderPage = () =>
  render(
    <AdminContext dataProvider={testDataProvider()}>
      <MyAvailabilityPage />
      <Notification />
    </AdminContext>,
  );

/** The PUT body from the last save, if any. */
function lastSaveBody(): { entries: { date: string; shiftCodes: ShiftCode[] }[] } | undefined {
  const call = [...mockApiFetch.mock.calls]
    .reverse()
    .find(([path, options]) => path === '/availability/me' && options?.method === 'PUT');
  return call?.[1]?.body;
}

describe('MyAvailabilityPage', () => {
  beforeEach(() => {
    mockUseIsMobile.mockReturnValue(false);
    stubApi();
  });

  // ── no window ────────────────────────────────────────────────────────────────

  it('explains that nothing is open when there is no window', async () => {
    stubApi({
      me: { window: null, canSubmit: false, declined: false, calendar: [], entries: [] },
    });

    renderPage();

    expect(
      await screen.findByText('No availability window is currently open'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save availability/i })).not.toBeInTheDocument();
  });

  // ── open window ──────────────────────────────────────────────────────────────

  it('shows the open window and its date range', async () => {
    renderPage();

    expect(await screen.findByText('Window open')).toBeInTheDocument();
    expect(screen.getByText('28 Sep 2026 – 5 Oct 2026')).toBeInTheDocument();
  });

  it('renders a month calendar covering the window', async () => {
    renderPage();

    // The window starts in September, so that month opens first.
    expect(await screen.findByText('September 2026')).toBeInTheDocument();
    expect(await screen.findByLabelText('Mon, 28 Sep 20:00–24:00')).toBeInTheDocument();
    expect(screen.getByLabelText('Sat, 3 Oct 08:00–16:00')).toBeInTheDocument();
    expect(screen.getByLabelText('Sat, 3 Oct 16:00–24:00')).toBeInTheDocument();
  });

  it('gives workdays one shift and weekends two, per the fixed pattern', async () => {
    renderPage();

    // Tue 29 Sep is a workday: only the evening shift is offered.
    expect(await screen.findByLabelText('Tue, 29 Sep 20:00–24:00')).toBeInTheDocument();
    expect(screen.queryByLabelText('Tue, 29 Sep 08:00–16:00')).not.toBeInTheDocument();
    // Sun 4 Oct is a weekend day: two shifts.
    expect(screen.getByLabelText('Sun, 4 Oct 08:00–16:00')).toBeInTheDocument();
    expect(screen.getByLabelText('Sun, 4 Oct 16:00–24:00')).toBeInTheDocument();
  });

  it('leaves days outside the window read-only', async () => {
    renderPage();

    // 27 Sep is one day before the window opens: it previews the same fixed
    // pattern but offers no toggle.
    await screen.findByLabelText('Mon, 28 Sep 20:00–24:00');
    expect(screen.queryByLabelText('Sun, 27 Sep 08:00–16:00')).not.toBeInTheDocument();
  });

  it('pre-checks shifts already submitted', async () => {
    stubApi({
      me: myAvailability({
        entries: [{ date: WINDOW_START, shiftCodes: [ShiftCode.EVENING] }],
      }),
    });

    renderPage();

    const toggle = await screen.findByLabelText('Mon, 28 Sep 20:00–24:00');
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Tue, 29 Sep 20:00–24:00')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  // ── saving ───────────────────────────────────────────────────────────────────

  it('keeps Save disabled until something changes', async () => {
    renderPage();

    const save = await screen.findByRole('button', { name: /save availability/i });
    expect(save).toBeDisabled();

    await userEvent.click(await screen.findByLabelText('Mon, 28 Sep 20:00–24:00'));

    expect(save).toBeEnabled();
  });

  it('submits the selected day and shift', async () => {
    renderPage();

    await userEvent.click(await screen.findByLabelText('Mon, 28 Sep 20:00–24:00'));
    await userEvent.click(screen.getByLabelText('Sat, 3 Oct 16:00–24:00'));
    await userEvent.click(screen.getByRole('button', { name: /save availability/i }));

    await waitFor(() => expect(lastSaveBody()).toBeDefined());
    expect(lastSaveBody()).toEqual({
      entries: [
        { date: '2026-09-28', shiftCodes: [ShiftCode.EVENING] },
        { date: '2026-10-03', shiftCodes: [ShiftCode.AFTERNOON] },
      ],
    });
  });

  it('drops a de-selected shift from the submission', async () => {
    stubApi({
      me: myAvailability({
        entries: [
          { date: WINDOW_START, shiftCodes: [ShiftCode.EVENING] },
          { date: '2026-09-29', shiftCodes: [ShiftCode.EVENING] },
        ],
      }),
    });

    renderPage();

    await userEvent.click(await screen.findByLabelText('Tue, 29 Sep 20:00–24:00'));
    await userEvent.click(screen.getByRole('button', { name: /save availability/i }));

    await waitFor(() => expect(lastSaveBody()).toBeDefined());
    expect(lastSaveBody()).toEqual({
      entries: [{ date: '2026-09-28', shiftCodes: [ShiftCode.EVENING] }],
    });
  });

  it('reports a rejected save without losing the selection', async () => {
    stubApi({
      onPut: () => {
        throw new Error('No availability window is currently open');
      },
    });

    renderPage();

    await userEvent.click(await screen.findByLabelText('Mon, 28 Sep 20:00–24:00'));
    await userEvent.click(screen.getByRole('button', { name: /save availability/i }));

    expect(
      await screen.findByText('No availability window is currently open'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Mon, 28 Sep 20:00–24:00')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  // ── decline ──────────────────────────────────────────────────────────────────

  it('offers "no availability this window" as a distinct answer', async () => {
    renderPage();

    expect(await screen.findByText('I have no availability this window')).toBeInTheDocument();
  });

  it('declines via POST and hides the calendar', async () => {
    const declined = myAvailability({ declined: true });
    stubApi({ onDecline: () => declined });

    renderPage();

    await screen.findByText('September 2026');
    await userEvent.click(screen.getByRole('checkbox'));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/availability/me/decline', {
        method: 'POST',
      }),
    );
    expect(
      await screen.findByText("You've told us you're not available this window"),
    ).toBeInTheDocument();
    expect(screen.queryByText('September 2026')).not.toBeInTheDocument();
  });

  it('undoes a decline via DELETE, bringing the calendar back', async () => {
    stubApi({
      me: myAvailability({ declined: true }),
      onDecline: (method) => myAvailability({ declined: method === 'POST' }),
    });

    renderPage();

    const checkbox = await screen.findByRole('checkbox');
    expect(checkbox).toBeChecked();

    await userEvent.click(checkbox);

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/availability/me/decline', {
        method: 'DELETE',
      }),
    );
    expect(await screen.findByText('September 2026')).toBeInTheDocument();
  });

  // ── closed window ────────────────────────────────────────────────────────────

  describe('when the window is closed', () => {
    beforeEach(() => {
      stubApi({
        me: myAvailability({
          window: CLOSED_WINDOW,
          canSubmit: false,
          entries: [{ date: WINDOW_START, shiftCodes: [ShiftCode.EVENING] }],
        }),
      });
    });

    it('says so and offers no way to change anything', async () => {
      renderPage();

      expect(await screen.findByText('Window closed')).toBeInTheDocument();
      expect(screen.getByText(/no further changes can be made/i)).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /save availability/i }),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    });

    it('still shows the final submissions, read-only', async () => {
      renderPage();

      await screen.findByText('September 2026');
      expect(screen.queryByLabelText('Mon, 28 Sep 20:00–24:00')).not.toBeInTheDocument();
      // Read-only cells show the shift hours without a toggle.
      expect(screen.getAllByText('20–24h').length).toBeGreaterThan(0);
    });
  });

  // ── responsive swap ──────────────────────────────────────────────────────────

  describe('on a narrow viewport', () => {
    beforeEach(() => {
      mockUseIsMobile.mockReturnValue(true);
    });

    it('swaps the calendar for a day-card agenda of the window only', async () => {
      renderPage();

      expect(await screen.findByText('Mon, 28 Sep')).toBeInTheDocument();
      expect(screen.queryByText('September 2026')).not.toBeInTheDocument();
      expect(screen.getByText(`Sun, 4 Oct`)).toBeInTheDocument();
      // Only in-window days appear.
      expect(screen.queryByText('Sun, 27 Sep')).not.toBeInTheDocument();
    });

    it('does not fetch the month preview it cannot show', async () => {
      renderPage();

      await screen.findByText('Mon, 28 Sep');
      expect(
        mockApiFetch.mock.calls.some((call) =>
          String(call[0]).startsWith('/availability/calendar'),
        ),
      ).toBe(false);
    });

    it('toggles a shift from the expanded day card', async () => {
      renderPage();

      // The first day is expanded by default.
      const card = (await screen.findByText('Mon, 28 Sep')).closest(
        '.MuiCard-root',
      ) as HTMLElement;
      await userEvent.click(within(card).getByLabelText('Mon, 28 Sep 20:00–24:00'));
      await userEvent.click(screen.getByRole('button', { name: /save availability/i }));

      await waitFor(() => expect(lastSaveBody()).toBeDefined());
      expect(lastSaveBody()).toEqual({
        entries: [{ date: WINDOW_START, shiftCodes: [ShiftCode.EVENING] }],
      });
    });

    it('summarises each collapsed day', async () => {
      stubApi({
        me: myAvailability({
          entries: [{ date: WINDOW_END, shiftCodes: [ShiftCode.MORNING] }],
        }),
      });

      renderPage();

      const holidayCard = (await screen.findByText('Mon, 5 Oct')).closest(
        '.MuiCard-root',
      ) as HTMLElement;
      expect(within(holidayCard).getByText('Implantação da República')).toBeInTheDocument();
      expect(within(holidayCard).getByText('1 of 2')).toBeInTheDocument();
    });
  });

  it('surfaces a load failure', async () => {
    mockApiFetch.mockRejectedValue(new Error('Session expired'));

    renderPage();

    expect(await screen.findByText('Session expired')).toBeInTheDocument();
  });
});
