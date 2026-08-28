import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminContext, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import {
  ActivityStatistics,
  EventReportType,
  FleetStatistics,
  PeopleStatistics,
  VictimDestinationKind,
  VolunteerActivityType,
} from '@redinfo/shared';
import { StatisticsPage } from './StatisticsPage';
import { apiFetch } from '../api';
import { messages } from '../i18n/i18nProvider';
import { theme } from '../layout/theme';
import { renderMobile } from '../test/renderMobile';

vi.mock('../api', () => ({ apiFetch: vi.fn(), apiDownload: vi.fn() }));
vi.mock('react-admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-admin')>()),
  Title: () => null,
}));

const mockApiFetch = apiFetch as unknown as Mock;

const authProvider = {
  login: () => Promise.resolve(),
  logout: () => Promise.resolve(),
  checkAuth: () => Promise.resolve(),
  checkError: () => Promise.resolve(),
  getPermissions: () => Promise.resolve(),
  getIdentity: () => Promise.resolve({ id: 'u-ana', fullName: 'Ana Silva' } as never),
};

const PEOPLE: PeopleStatistics = {
  from: '2025-09-01',
  to: '2026-08-28',
  totalApprovedHours: 402,
  activeVolunteers: 34,
  previousPeriodActiveVolunteers: 31,
  eventsWithParticipation: 663,
  averageHoursPerVolunteer: 11.8,
  viewer: { hours: 40.2, previousPeriodHours: 2.2, events: 12, rank: 8, totalVolunteers: 34, monthlyHours: [] },
  monthlyHours: [{ month: '2026-08', value: 40 }],
  hoursByActivityType: [
    { activityType: VolunteerActivityType.EMERGENCY, hours: 300 },
    { activityType: VolunteerActivityType.LOCAL_SUPPORT, hours: 60 },
    { activityType: VolunteerActivityType.SALOP_SUPPORT, hours: 20 },
    { activityType: VolunteerActivityType.MEETING, hours: 12 },
    { activityType: VolunteerActivityType.TRAINING, hours: 10 },
    { activityType: VolunteerActivityType.OTHER, hours: 0 },
  ],
  roster: [
    {
      userId: 'u-bruno',
      firstName: 'Bruno',
      lastName: 'Alves',
      hours: 60,
      events: 20,
      emergencyEvents: 15,
      supportEvents: 5,
      lastActivityDate: '2026-08-22',
    },
    {
      userId: 'u-ana',
      firstName: 'Ana',
      lastName: 'Abreu',
      hours: 40.2,
      events: 12,
      emergencyEvents: 9,
      supportEvents: 3,
      lastActivityDate: '2026-08-20',
    },
  ],
};

const ACTIVITY: ActivityStatistics = {
  from: '2025-09-01',
  to: '2026-08-28',
  totalEvents: 663,
  previousPeriodEvents: 600,
  victimsAssisted: 590,
  eventsByType: [
    { type: EventReportType.EMERGENCY, count: 497 },
    { type: EventReportType.LOCAL_SUPPORT, count: 113 },
    { type: EventReportType.SALOP_SUPPORT, count: 53 },
  ],
  eventsByMonth: [
    { month: '2026-08', byType: { EMERGENCY: 40, LOCAL_SUPPORT: 10, SALOP_SUPPORT: 5 }, total: 55 },
  ],
  activationHeatmap: [{ weekday: 3, band: 2, count: 5 }],
  eventsByLocality: [{ id: 'l-1', name: 'Barcelos', count: 100 }],
  eventsByLocalityOther: 10,
  eventsByMunicipality: [{ id: 'm-1', name: 'Barcelos', count: 200 }],
  eventsByMunicipalityOther: 0,
  destinationHospitals: [{ id: 'h-1', name: 'Hospital de Braga', municipality: 'Braga', count: 80 }],
  victimOutcomes: [
    { kind: VictimDestinationKind.HOSPITAL, count: 400 },
    { kind: VictimDestinationKind.TREATED_ON_SCENE, count: 190 },
    { kind: VictimDestinationKind.REFUSED_TRANSPORT, count: 0 },
    { kind: VictimDestinationKind.DECEASED_ON_SCENE, count: 0 },
    { kind: VictimDestinationKind.CANCELLED, count: 0 },
  ],
  inemUnits: [{ unitType: 'VMER' as never, hospitalName: 'Hospital de Braga', count: 4 }],
};

const FLEET: FleetStatistics = {
  from: '2025-09-01',
  to: '2026-08-28',
  totalKilometres: 13860,
  eventCount: 497,
  kmPerEventMean: 28,
  kmPerEventMedian: 24,
  vehicles: [
    {
      vehicleId: 'v-1',
      numeroCauda: 'ABT 01',
      licensePlate: 'AA-11-BB',
      totalKilometres: 8000,
      monthlyKilometres: [{ month: '2026-08', value: 700 }],
    },
  ],
  responseLegs: [
    { leg: 'ACTIVATION_TO_SCENE' as never, medianMinutes: 11, p90Minutes: 21, sampleSize: 400 },
    { leg: 'ON_SCENE' as never, medianMinutes: 18, p90Minutes: 34, sampleSize: 400 },
    { leg: 'SCENE_TO_HOSPITAL' as never, medianMinutes: 16, p90Minutes: 29, sampleSize: 380 },
    { leg: 'HOSPITAL_TO_AVAILABLE' as never, medianMinutes: 14, p90Minutes: 27, sampleSize: 370 },
  ],
  totalDurationMedianMinutes: 63,
  timedEmergencies: 418,
  totalEmergencies: 497,
};

function respondByEndpoint() {
  mockApiFetch.mockImplementation((path: string) => {
    if (path.startsWith('/statistics/people')) return Promise.resolve(PEOPLE);
    if (path.startsWith('/statistics/activity')) return Promise.resolve(ACTIVITY);
    if (path.startsWith('/statistics/fleet')) return Promise.resolve(FLEET);
    return Promise.reject(new Error(`unexpected path ${path}`));
  });
}

// `renderMobile` (used below) permanently overwrites `window.matchMedia` for
// the rest of the file — reassert the desktop (never-matches) stub before
// every desktop render so test order can't leak a narrow viewport in.
function stubDesktopMatchMedia() {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

const renderDesktop = (locale: 'pt' | 'en' = 'pt') => {
  stubDesktopMatchMedia();
  const i18nProvider = polyglotI18nProvider(messages, locale);
  return render(
    <MemoryRouter>
      <AdminContext dataProvider={testDataProvider()} authProvider={authProvider} i18nProvider={i18nProvider}>
        <ThemeProvider theme={theme}>
          <StatisticsPage />
        </ThemeProvider>
      </AdminContext>
    </MemoryRouter>,
  );
};

describe('StatisticsPage', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    respondByEndpoint();
  });

  it("shows the people tab's hero total and the roster, with the viewer's own row highlighted", async () => {
    renderDesktop();
    expect(await screen.findByText('Horas de voluntariado aprovadas')).toBeInTheDocument();
    expect(screen.getByText('402')).toBeInTheDocument();
    expect(screen.getByText(/Bruno Alves/)).toBeInTheDocument();
    expect(screen.getByText(/Ana Abreu/)).toBeInTheDocument();
    expect(screen.getByText('(tu)')).toBeInTheDocument();
  });

  it('renders in English when the locale is en', async () => {
    renderDesktop('en');
    expect(await screen.findByText('Approved volunteer hours')).toBeInTheDocument();
    expect(screen.getByText('Statistics')).toBeInTheDocument();
  });

  it('fetches the activity tab only once it is selected, and shows no type filter on the people tab', async () => {
    renderDesktop();
    await screen.findByText('Horas de voluntariado aprovadas');
    expect(mockApiFetch).not.toHaveBeenCalledWith(expect.stringContaining('/statistics/activity'));
    expect(screen.queryByText('Todos')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Atividade' }));

    expect(await screen.findByText('Eventos registados')).toBeInTheDocument();
    expect(mockApiFetch).toHaveBeenCalledWith(expect.stringContaining('/statistics/activity'));
    expect(screen.getByText('Todos')).toBeInTheDocument();
  });

  it('re-fetches activity with the type filter applied when a type chip is clicked', async () => {
    renderDesktop();
    await userEvent.click(screen.getByRole('tab', { name: 'Atividade' }));
    await screen.findByText('Eventos registados');
    mockApiFetch.mockClear();

    await userEvent.click(screen.getByRole('button', { name: 'Emergência' }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(expect.stringContaining('type=EMERGENCY')),
    );
  });

  it('shows the fleet tab hero and response-leg data', async () => {
    renderDesktop();
    await userEvent.click(screen.getByRole('tab', { name: 'Frota & Resposta' }));
    expect(await screen.findByText('Quilómetros percorridos')).toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.textContent?.replace(/\D/g, '') === '13860')).toBeTruthy();
  });

  it('renders on a phone without crashing, and still shows the roster', async () => {
    renderMobile(<StatisticsPage />, { locale: 'pt' });
    expect(await screen.findByText('Horas de voluntariado aprovadas')).toBeInTheDocument();
    expect(screen.getByText(/Bruno Alves/)).toBeInTheDocument();
  });

  it("keeps the roster sortable while defaulting to hours, so a reader can read it as a plain list", async () => {
    renderDesktop();
    await screen.findByText(/Bruno Alves/);
    const rosterCard = screen.getByText('Voluntários').closest('.MuiCard-root') as HTMLElement;
    const rows = within(rosterCard).getAllByRole('row').slice(1); // drop the header row
    expect(within(rows[0]).getByText(/Bruno Alves/)).toBeInTheDocument();

    await userEvent.click(within(rosterCard).getByRole('combobox'));
    await userEvent.click(await screen.findByRole('option', { name: 'Nome' }));

    const sortedRows = within(rosterCard).getAllByRole('row').slice(1);
    expect(within(sortedRows[0]).getByText(/Ana Abreu/)).toBeInTheDocument();
  });
});
