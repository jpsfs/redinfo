import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminContext, Notification, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import { toMinuteOfDay } from '@redinfo/shared';
import { messages } from '../i18n/i18nProvider';
import { MyAvailabilityPage } from './MyAvailabilityPage';
import { apiFetch } from '../api';
import { useIsMobile } from '../hooks/useIsMobile';
import {
  CLOSED_WINDOW,
  LOCAL_SUPPORT_WINDOW,
  OPEN_WINDOW,
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

/** Minutes from midnight, so the expectations read in wall-clock time. */
const at = (hour: number, minute = 0) => toMinuteOfDay(hour, minute);

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
      if (path.startsWith('/availability/me/decline')) {
        return Promise.resolve(handlers.onDecline?.(options?.method ?? 'POST') ?? me);
      }
      if (path === '/availability/me' && options?.method === 'PUT') {
        return Promise.resolve(handlers.onPut?.(options.body) ?? me);
      }
      return Promise.resolve(me);
    },
  );
}

// This screen has not gone through #180 phase 3 yet — it is still English by
// convention, so a real i18nProvider is pinned to 'en' rather than left
// unset (which would fall back to react-admin's own default translate, the
// raw key — what `windowCategoryLabel` would otherwise render as).
const i18nProvider = polyglotI18nProvider(messages, 'en');

/** `Notification` is rendered so `useNotify` messages are assertable. */
const renderPage = () =>
  render(
    <AdminContext dataProvider={testDataProvider()} i18nProvider={i18nProvider}>
      <MyAvailabilityPage />
      <Notification />
    </AdminContext>,
  );

/** The PUT body from the last save, if any. */
function lastSaveBody(): { entries: { date: string; slots: number[] }[] } | undefined {
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
      me: {
        window: null,
        windows: [],
        canSubmit: false,
        declined: false,
        calendar: [],
        entries: [],
      },
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
        entries: [{ date: WINDOW_START, slots: [1] }],
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
      // The window is always named: with several open, the API refuses to guess.
      windowId: 'win-1',
      entries: [
        { date: '2026-09-28', slots: [1] },
        { date: '2026-10-03', slots: [2] },
      ],
    });
  });

  it('drops a de-selected shift from the submission', async () => {
    stubApi({
      me: myAvailability({
        entries: [
          { date: WINDOW_START, slots: [1] },
          { date: '2026-09-29', slots: [1] },
        ],
      }),
    });

    renderPage();

    await userEvent.click(await screen.findByLabelText('Tue, 29 Sep 20:00–24:00'));
    await userEvent.click(screen.getByRole('button', { name: /save availability/i }));

    await waitFor(() => expect(lastSaveBody()).toBeDefined());
    expect(lastSaveBody()).toEqual({
      windowId: 'win-1',
      entries: [{ date: '2026-09-28', slots: [1] }],
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
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/availability/me/decline?windowId=win-1',
        { method: 'POST' },
      ),
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
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/availability/me/decline?windowId=win-1',
        { method: 'DELETE' },
      ),
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
          entries: [{ date: WINDOW_START, slots: [1] }],
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
      expect(screen.getAllByText('20–24').length).toBeGreaterThan(0);
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
        windowId: 'win-1',
        entries: [{ date: WINDOW_START, slots: [1] }],
      });
    });

    it('summarises each collapsed day', async () => {
      stubApi({
        me: myAvailability({
          entries: [{ date: WINDOW_END, slots: [1] }],
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

  // ── which window is being answered ──────────────────────────────────────────

  describe('category and name', () => {
    it('shows the category and name of the window alongside its dates', async () => {
      renderPage();

      expect(await screen.findByText('Emergency')).toBeInTheDocument();
      expect(screen.getByText('Emergency - October')).toBeInTheDocument();
      expect(screen.getByText('28 Sep 2026 – 5 Oct 2026')).toBeInTheDocument();
    });

    it('never asks about roles, which are the coordinator’s to assign', async () => {
      // The window carries a crew (Driver, Team Leader, Team Member); a
      // volunteer says only when they can be there, so none of it belongs here.
      renderPage();

      await screen.findByText('Emergency - October');
      for (const role of ['Driver', 'Team Leader', 'Team Member']) {
        expect(screen.queryByText(role)).not.toBeInTheDocument();
      }
    });

    it('offers no picker when only one window is open', async () => {
      renderPage();

      await screen.findByText('Window open');
      expect(screen.queryByLabelText('Availability window')).not.toBeInTheDocument();
    });

    it('lets a volunteer switch between the open windows', async () => {
      stubApi({
        me: myAvailability({ windows: [OPEN_WINDOW, LOCAL_SUPPORT_WINDOW] }),
      });

      renderPage();

      const picker = await screen.findByLabelText('Availability window');
      expect(
        within(picker as HTMLElement).getByRole('option', {
          name: 'Emergency - October · 28 Sep 2026 – 5 Oct 2026',
        }),
      ).toBeInTheDocument();
      // The nameless one falls back to its category.
      expect(
        within(picker as HTMLElement).getByRole('option', {
          name: 'Local Support · 28 Sep 2026 – 5 Oct 2026',
        }),
      ).toBeInTheDocument();
    });

    it('reloads for the window picked', async () => {
      stubApi({
        me: myAvailability({ windows: [OPEN_WINDOW, LOCAL_SUPPORT_WINDOW] }),
      });

      renderPage();

      await userEvent.selectOptions(
        await screen.findByLabelText('Availability window'),
        'win-2',
      );

      await waitFor(() =>
        expect(mockApiFetch).toHaveBeenCalledWith('/availability/me?windowId=win-2'),
      );
    });

    it('keeps a closed window on the picker while it is the one shown', async () => {
      stubApi({
        me: myAvailability({
          window: CLOSED_WINDOW,
          canSubmit: false,
          windows: [CLOSED_WINDOW, LOCAL_SUPPORT_WINDOW],
        }),
      });

      renderPage();

      expect(await screen.findByText('Window closed')).toBeInTheDocument();
      expect(screen.getByLabelText('Availability window')).toHaveValue('win-1');
    });
  });

  // ── windows that define their own shift times ───────────────────────────────

  describe('with per-day shift times', () => {
    /** A window whose Monday is 10:00–14:00 and whose Tuesday has no shifts. */
    function customCalendar(from: string, to: string) {
      return calendarFor(from, to).map((day) => {
        if (day.date === WINDOW_START) {
          return {
            ...day,
            shifts: [
              {
                slot: 1,
                startMinute: at(10),
                endMinute: at(14),
                vehiclesNeeded: 1,
                label: '10:00–14:00',
              },
            ],
          };
        }
        if (day.date === '2026-09-29') return { ...day, shifts: [] };
        return day;
      });
    }

    function stubCustomApi() {
      const me = myAvailability({ calendar: customCalendar(WINDOW_START, WINDOW_END) });
      mockApiFetch.mockImplementation(
        (path: string, options?: { method?: string; body?: unknown }) => {
          if (path.startsWith('/availability/calendar')) {
            const params = new URL(`http://x${path}`).searchParams;
            return Promise.resolve(customCalendar(params.get('from')!, params.get('to')!));
          }
          if (path === '/availability/me' && options?.method === 'PUT') {
            return Promise.resolve(me);
          }
          return Promise.resolve(me);
        },
      );
    }

    it("asks for the calendar of the window in play, so its own shifts come back", async () => {
      renderPage();

      await screen.findByLabelText('Mon, 28 Sep 20:00–24:00');
      const calendarCalls = mockApiFetch.mock.calls.filter(([path]) =>
        String(path).startsWith('/availability/calendar'),
      );
      expect(calendarCalls.length).toBeGreaterThan(0);
      expect(calendarCalls.every(([path]) => String(path).includes('windowId=win-1'))).toBe(
        true,
      );
    });

    it('offers the hours the window set, not the default grid', async () => {
      stubCustomApi();

      renderPage();

      expect(await screen.findByLabelText('Mon, 28 Sep 10:00–14:00')).toBeInTheDocument();
      expect(screen.queryByLabelText('Mon, 28 Sep 20:00–24:00')).not.toBeInTheDocument();
    });

    it('offers nothing on a day the window left without shifts', async () => {
      stubCustomApi();

      renderPage();

      await screen.findByLabelText('Mon, 28 Sep 10:00–14:00');
      expect(screen.queryByLabelText(/Tue, 29 Sep/)).not.toBeInTheDocument();
    });

    it('saves the slot of the shift that was ticked', async () => {
      stubCustomApi();

      renderPage();
      await userEvent.click(await screen.findByLabelText('Mon, 28 Sep 10:00–14:00'));
      await userEvent.click(screen.getByRole('button', { name: /save availability/i }));

      await waitFor(() =>
        expect(lastSaveBody()).toEqual({
          windowId: 'win-1',
          entries: [{ date: WINDOW_START, slots: [1] }],
        }),
      );
    });

    it('tells a volunteer on a phone that a day has no shifts', async () => {
      mockUseIsMobile.mockReturnValue(true);
      stubCustomApi();

      renderPage();

      const card = (await screen.findByText('Tue, 29 Sep')).closest(
        '.MuiCard-root',
      ) as HTMLElement;
      await userEvent.click(within(card).getByLabelText('Expand'));
      expect(within(card).getByText('No shifts on this day.')).toBeInTheDocument();
    });
  });
});
