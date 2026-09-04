import type React from 'react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AdminContext, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import { MemoryRouter } from 'react-router-dom';
import { AvailabilityWindowCategory, UserRole } from '@redinfo/shared';
import { messages } from '../i18n/i18nProvider';
import {
  BirthdaysCard,
  CertificationAlertsTile,
  Dashboard,
  TodayScheduleCard,
  UpcomingShiftsPanel,
} from './Dashboard';
import { apiFetch } from '../api';
import { addIsoDays, toIsoDate } from '../utils/dates';

vi.mock('../api', () => ({ apiFetch: vi.fn(), apiDownload: vi.fn(), apiUpload: vi.fn() }));

const mockApiFetch = apiFetch as unknown as Mock;

// English, matching this file's existing assertions — the Dashboard reads
// through a real i18nProvider now, rather than a mix of a hardcoded
// Portuguese welcome card and hardcoded English tiles.
const i18nProvider = polyglotI18nProvider(messages, 'en');

function renderTile(roles: UserRole[]) {
  const authProvider = {
    login: () => Promise.resolve(),
    logout: () => Promise.resolve(),
    checkAuth: () => Promise.resolve(),
    checkError: () => Promise.resolve(),
    getPermissions: () => Promise.resolve(roles),
  };

  render(
    <MemoryRouter>
      <AdminContext dataProvider={testDataProvider()} authProvider={authProvider} i18nProvider={i18nProvider}>
        <CertificationAlertsTile />
      </AdminContext>
    </MemoryRouter>,
  );
}

function renderUpcomingShifts() {
  const authProvider = {
    login: () => Promise.resolve(),
    logout: () => Promise.resolve(),
    checkAuth: () => Promise.resolve(),
    checkError: () => Promise.resolve(),
    getPermissions: () => Promise.resolve([UserRole.EMERGENCY_OPERATIONAL]),
  };

  render(
    <MemoryRouter>
      <AdminContext dataProvider={testDataProvider()} authProvider={authProvider} i18nProvider={i18nProvider}>
        <UpcomingShiftsPanel />
      </AdminContext>
    </MemoryRouter>,
  );
}

// Built off the real clock rather than a faked one — `vi.useFakeTimers()`
// freezes the `setTimeout` polling `waitFor`/`findBy*` rely on internally,
// which hangs this suite instead of failing it.
const TODAY = toIsoDate(new Date());
const inDays = (days: number) => addIsoDays(TODAY, days);

const duty = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'duty-1',
  scheduleId: 'sch-1',
  windowId: 'win-1',
  windowCategory: AvailabilityWindowCategory.EMERGENCY,
  windowLabel: 'Emergency — September',
  date: inDays(2),
  slot: 0,
  startMinute: 480,
  endMinute: 1200,
  label: '08:00–20:00',
  vehiclesNeeded: 1,
  roleName: null,
  ...overrides,
});

// The card groups by schedule, so two shifts on the same rota collapse under
// one heading and a third shift on a different rota gets its own.
describe('UpcomingShiftsPanel', () => {
  beforeEach(() => mockApiFetch.mockReset());

  it('renders nothing while there is nothing due within 7 days', async () => {
    mockApiFetch.mockResolvedValue({ upcoming: [], past: [] });
    renderUpcomingShifts();

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/schedules/me'));
    expect(screen.queryByTestId('upcoming-shifts-panel')).not.toBeInTheDocument();
  });

  it('drops a shift beyond the 7-day horizon', async () => {
    mockApiFetch.mockResolvedValue({
      upcoming: [duty({ id: 'far', date: inDays(20) })],
      past: [],
    });
    renderUpcomingShifts();

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/schedules/me'));
    expect(screen.queryByTestId('upcoming-shifts-panel')).not.toBeInTheDocument();
  });

  it('groups shifts on the same schedule under one heading', async () => {
    mockApiFetch.mockResolvedValue({
      upcoming: [
        duty({ id: 'd1', date: inDays(2), roleName: 'Motorista' }),
        duty({ id: 'd2', date: inDays(4) }),
        duty({
          id: 'd3',
          scheduleId: 'sch-2',
          windowCategory: AvailabilityWindowCategory.LOCAL_SUPPORT,
          windowLabel: 'Apoio Local — Feira',
          date: inDays(5),
          label: '10:00–18:00',
        }),
      ],
      past: [],
    });
    renderUpcomingShifts();

    expect(await screen.findByText('Your upcoming shifts')).toBeInTheDocument();
    expect(screen.getByText('Emergency — September')).toBeInTheDocument();
    expect(screen.getByText('Apoio Local — Feira')).toBeInTheDocument();
    expect(screen.getAllByText('08:00–20:00')).toHaveLength(2);
    expect(screen.getByText('10:00–18:00')).toBeInTheDocument();
    expect(screen.getByText('Motorista')).toBeInTheDocument();
  });
});

// #182 AC: "A coordinator/admin sees a dashboard tile counting personnel with
// a certification expiring within 6 months and personnel with one already
// expired, and can click through to the (already filterable) personnel
// registry" — gated the same way certification management itself is.

describe('CertificationAlertsTile', () => {
  beforeEach(() => mockApiFetch.mockReset());

  it('is invisible to someone without MANAGE_PERSONNEL', async () => {
    mockApiFetch.mockResolvedValue({ expiring: 3, expired: 1 });
    renderTile([UserRole.EMERGENCY_OPERATIONAL]);

    // Give the effect a chance to run — it must not even fetch.
    await waitFor(() => expect(mockApiFetch).not.toHaveBeenCalled());
    expect(screen.queryByTestId('certification-alerts-tile')).not.toBeInTheDocument();
  });

  it('shows counts of expiring and expired personnel to a coordinator', async () => {
    mockApiFetch.mockResolvedValue({ expiring: 3, expired: 1 });
    renderTile([UserRole.EMERGENCY_COORDINATOR]);

    expect(await screen.findByText('1 expired')).toBeInTheDocument();
    expect(screen.getByText('3 expiring within 6 months')).toBeInTheDocument();
  });

  it('renders nothing when there is nothing to flag', async () => {
    mockApiFetch.mockResolvedValue({ expiring: 0, expired: 0 });
    renderTile([UserRole.EMERGENCY_COORDINATOR]);

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    expect(screen.queryByTestId('certification-alerts-tile')).not.toBeInTheDocument();
  });

  it('links each count through to the personnel registry, filtered', async () => {
    mockApiFetch.mockResolvedValue({ expiring: 0, expired: 2 });
    renderTile([UserRole.SYSTEM_ADMIN]);

    const link = await screen.findByRole('link', { name: '2 expired' });
    expect(link).toHaveAttribute(
      'href',
      `/users?filter=${encodeURIComponent(JSON.stringify({ certificationStatus: 'EXPIRED' }))}`,
    );
  });
});

function renderWithAdmin(node: React.ReactNode, identityId = 'me') {
  const authProvider = {
    login: () => Promise.resolve(),
    logout: () => Promise.resolve(),
    checkAuth: () => Promise.resolve(),
    checkError: () => Promise.resolve(),
    getPermissions: () => Promise.resolve([UserRole.EMERGENCY_OPERATIONAL]),
    getIdentity: () => Promise.resolve({ id: identityId, fullName: 'Eu Proprio' }),
  };

  render(
    <MemoryRouter>
      <AdminContext dataProvider={testDataProvider()} authProvider={authProvider} i18nProvider={i18nProvider}>
        {node}
      </AdminContext>
    </MemoryRouter>,
  );
}

const rosterSlot = (overrides: Partial<Record<string, unknown>> = {}) => ({
  scheduleId: 'sch-1',
  windowId: 'win-1',
  windowLabel: 'Emergency — September',
  slot: 1,
  startMinute: 480,
  endMinute: 1200,
  label: '08:00–20:00',
  vehiclesNeeded: 1,
  crew: [
    { userId: 'u-ana', firstName: 'Ana', lastName: 'Silva', roleName: 'Motorista' },
    { userId: 'u-joana', firstName: 'Joana', lastName: 'Pinto', roleName: null },
  ],
  ...overrides,
});

// The Dashboard's first card, and the only one that renders on an empty day:
// "there is no shift today" is the answer someone opened this to get, so it
// must be said rather than left as a missing card.
describe('TodayScheduleCard', () => {
  beforeEach(() => mockApiFetch.mockReset());

  it('says there is no shift today when nothing runs', async () => {
    mockApiFetch.mockResolvedValue({ date: TODAY, groups: [] });
    renderWithAdmin(<TodayScheduleCard />);

    expect(await screen.findByText('There is no shift today.')).toBeInTheDocument();
  });

  it('says so in Portuguese too', async () => {
    mockApiFetch.mockResolvedValue({ date: TODAY, groups: [] });
    render(
      <MemoryRouter>
        <AdminContext
          dataProvider={testDataProvider()}
          i18nProvider={polyglotI18nProvider(messages, 'pt')}
        >
          <TodayScheduleCard />
        </AdminContext>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Não há nenhum turno hoje.')).toBeInTheDocument();
  });

  it("lists each slot's crew with their roles", async () => {
    mockApiFetch.mockResolvedValue({
      date: TODAY,
      groups: [
        {
          category: AvailabilityWindowCategory.EMERGENCY,
          slots: [rosterSlot(), rosterSlot({ slot: 2, label: '20:00–08:00' })],
        },
      ],
    });
    renderWithAdmin(<TodayScheduleCard />);

    // Anchored on the rendered text, not on the fetch having been *called*:
    // the call resolving is not the same event as the state landing, and
    // under full-suite load the gap between them is wide enough to lose.
    expect(await screen.findByText('08:00–20:00')).toBeInTheDocument();
    expect(screen.getByText('20:00–08:00')).toBeInTheDocument();
    // A role is shown beside the name; someone with no role is just the name.
    expect(screen.getAllByText('Ana Silva · Motorista')).toHaveLength(2);
    expect(screen.getAllByText('Joana Pinto')).toHaveLength(2);
    expect(screen.queryByText('There is no shift today.')).not.toBeInTheDocument();
  });

  // Two rotas of the same category are one heading — "is there emergency cover
  // tonight" is the question, not "which of the two rotas is it on".
  it('groups by category, keeping each rota named', async () => {
    mockApiFetch.mockResolvedValue({
      date: TODAY,
      groups: [
        {
          category: AvailabilityWindowCategory.EMERGENCY,
          slots: [
            rosterSlot(),
            rosterSlot({ scheduleId: 'sch-2', windowLabel: 'Emergency — Aveiro' }),
          ],
        },
        {
          category: AvailabilityWindowCategory.LOCAL_SUPPORT,
          slots: [rosterSlot({ scheduleId: 'sch-3', windowLabel: 'Apoio Local — Feira' })],
        },
      ],
    });
    renderWithAdmin(<TodayScheduleCard />);

    expect(await screen.findByText('Emergency — September')).toBeInTheDocument();
    expect(screen.getByText('Emergency — Aveiro')).toBeInTheDocument();
    expect(screen.getByText('Apoio Local — Feira')).toBeInTheDocument();
    // One chip per category, not one per schedule.
    expect(screen.getAllByText('Emergency')).toHaveLength(1);
  });

  it('marks the signed-in person among the crew', async () => {
    mockApiFetch.mockResolvedValue({
      date: TODAY,
      groups: [{ category: AvailabilityWindowCategory.EMERGENCY, slots: [rosterSlot()] }],
    });
    renderWithAdmin(<TodayScheduleCard />, 'u-ana');

    const mine = await screen.findByText('Ana Silva · Motorista');
    const theirs = screen.getByText('Joana Pinto');
    expect(mine.closest('.MuiChip-root')).toHaveClass('MuiChip-filledPrimary');
    expect(theirs.closest('.MuiChip-root')).not.toHaveClass('MuiChip-filledPrimary');
  });

  // A failed fetch must not leave the card blank: the reader would take a
  // missing card for "nothing scheduled" either way, so say it outright.
  it('falls back to the empty state when the request fails', async () => {
    mockApiFetch.mockRejectedValue(new Error('Unauthorized'));
    renderWithAdmin(<TodayScheduleCard />);

    expect(await screen.findByText('There is no shift today.')).toBeInTheDocument();
  });
});

// Unlike the schedule card, this one is invisible on an ordinary day.
describe('BirthdaysCard', () => {
  beforeEach(() => mockApiFetch.mockReset());

  it('renders nothing when nobody has a birthday today', async () => {
    mockApiFetch.mockResolvedValue({ date: TODAY, people: [] });
    renderWithAdmin(<BirthdaysCard />);

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/users/birthdays'));
    expect(screen.queryByTestId('birthdays-card')).not.toBeInTheDocument();
  });

  it('names everyone whose birthday it is', async () => {
    mockApiFetch.mockResolvedValue({
      date: TODAY,
      people: [
        { id: 'u-ana', firstName: 'Ana', lastName: 'Silva' },
        { id: 'u-rui', firstName: 'Rui', lastName: 'Nunes' },
      ],
    });
    renderWithAdmin(<BirthdaysCard />);

    expect(await screen.findByText('2 birthdays today')).toBeInTheDocument();
    expect(screen.getByText('Ana Silva')).toBeInTheDocument();
    expect(screen.getByText('Rui Nunes')).toBeInTheDocument();
  });

  it('reads as a singular for one person', async () => {
    mockApiFetch.mockResolvedValue({
      date: TODAY,
      people: [{ id: 'u-ana', firstName: 'Ana', lastName: 'Silva' }],
    });
    renderWithAdmin(<BirthdaysCard />);

    expect(await screen.findByText('1 birthday today')).toBeInTheDocument();
  });

  it('stays invisible when the request fails', async () => {
    mockApiFetch.mockRejectedValue(new Error('boom'));
    renderWithAdmin(<BirthdaysCard />);

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/users/birthdays'));
    expect(screen.queryByTestId('birthdays-card')).not.toBeInTheDocument();
  });
});

describe('Dashboard', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockImplementation((url: string) => {
      if (url === '/live-runs') return Promise.resolve([]);
      if (url === '/users/certification-alerts') return Promise.resolve({ expiring: 0, expired: 0 });
      if (url === '/vehicles/low-stock') return Promise.resolve({ grouped: {}, total: 0 });
      if (url === '/schedules/me') return Promise.resolve({ upcoming: [], past: [] });
      if (url === '/schedules/today') return Promise.resolve({ date: TODAY, groups: [] });
      if (url === '/users/birthdays') return Promise.resolve({ date: TODAY, people: [] });
      return Promise.reject(new Error(`unexpected apiFetch(${url})`));
    });
  });

  // Guards #181's step 4a: `LiveRunBoard` gained an `emptyState` prop for the
  // standalone `/live-runs` screen, and the Dashboard's own copy (which passes
  // none) must keep rendering nothing at all when there are no open runs.
  it("renders nothing for the live-runs board when there are no open runs", async () => {
    const authProvider = {
      login: () => Promise.resolve(),
      logout: () => Promise.resolve(),
      checkAuth: () => Promise.resolve(),
      checkError: () => Promise.resolve(),
      getPermissions: () => Promise.resolve([UserRole.EMERGENCY_COORDINATOR]),
    };

    render(
      <MemoryRouter>
        <AdminContext
          dataProvider={testDataProvider({ getList: async () => ({ data: [], total: 0 }) })}
          authProvider={authProvider}
          i18nProvider={i18nProvider}
        >
          <Dashboard />
        </AdminContext>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Welcome to RedInfo')).toBeInTheDocument();
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/live-runs'));
    expect(screen.queryByTestId('BoltIcon')).not.toBeInTheDocument();
  });

  // Regression: the low-stock panel used to read its bearer token from a
  // `localStorage['auth']` key that never existed, so `/vehicles/low-stock`
  // always 401'd and the panel then crashed reading `.grouped` off the error
  // body — taking the whole Dashboard down for every signed-in user. It now
  // goes through `apiFetch`, which rejects cleanly on a non-2xx.
  it('does not crash the Dashboard when the low-stock endpoint is unauthorized', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url === '/live-runs') return Promise.resolve([]);
      if (url === '/users/certification-alerts') return Promise.resolve({ expiring: 0, expired: 0 });
      if (url === '/vehicles/low-stock') return Promise.reject(new Error('Unauthorized'));
      if (url === '/schedules/me') return Promise.resolve({ upcoming: [], past: [] });
      if (url === '/schedules/today') return Promise.resolve({ date: TODAY, groups: [] });
      if (url === '/users/birthdays') return Promise.resolve({ date: TODAY, people: [] });
      return Promise.reject(new Error(`unexpected apiFetch(${url})`));
    });

    const authProvider = {
      login: () => Promise.resolve(),
      logout: () => Promise.resolve(),
      checkAuth: () => Promise.resolve(),
      checkError: () => Promise.resolve(),
      getPermissions: () => Promise.resolve([UserRole.EMERGENCY_COORDINATOR]),
    };

    render(
      <MemoryRouter>
        <AdminContext
          dataProvider={testDataProvider({ getList: async () => ({ data: [], total: 0 }) })}
          authProvider={authProvider}
          i18nProvider={i18nProvider}
        >
          <Dashboard />
        </AdminContext>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Welcome to RedInfo')).toBeInTheDocument();
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/vehicles/low-stock'));
    expect(screen.queryByText(/Low Stock Vehicles/)).not.toBeInTheDocument();
    // Still there afterwards — proves the panel's own error didn't unmount the tree.
    expect(screen.getByText('Welcome to RedInfo')).toBeInTheDocument();
  });
});
