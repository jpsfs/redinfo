import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminContext, testDataProvider } from 'react-admin';
import { MemoryRouter } from 'react-router-dom';
import {
  EventLocationType,
  EventReport,
  EventReportType,
  Gender,
  UserRole,
  VictimDestinationKind,
} from '@redinfo/shared';
import { MyReportsPage } from './MyReportsPage';
import { apiFetch } from '../api';
import { emptyDraft, saveDraft } from '../resources/eventReports/reportDraft';

vi.mock('../api', () => ({ apiFetch: vi.fn(), apiDownload: vi.fn() }));

const mockApiFetch = apiFetch as unknown as Mock;

const report = (overrides: Partial<EventReport> = {}): EventReport =>
  ({
    id: 'rep-1',
    type: EventReportType.EMERGENCY,
    number: 128,
    year: 2026,
    occurredOn: '2026-08-22',
    startedAt: new Date(2026, 7, 22, 20, 14).toISOString(),
    endedAt: new Date(2026, 7, 22, 22, 5).toISOString(),
    externalReference: '2608 4471',
    locationType: EventLocationType.HOME,
    localityId: 'loc-taveiro',
    locality: { id: 'loc-taveiro', name: 'Taveiro', municipalityId: 'mun-coimbra' },
    operationalReport: '<p>x</p>',
    shift: null,
    crew: [],
    vehicles: [
      {
        id: 'v',
        vehicleId: 'veh-1',
        vehicle: { id: 'veh-1', licensePlate: 'AA-12-BC', numeroCauda: 'Amb. 04' },
        kilometres: 42,
        position: 0,
      },
    ],
    victims: [
      {
        id: 'vic',
        position: 0,
        gender: Gender.FEMALE,
        age: 67,
        destinationKind: VictimDestinationKind.HOSPITAL,
        destinationHospitalId: 'h',
        destinationHospital: { id: 'h', name: 'CHUC — Hospital Geral' },
      },
    ],
    attachments: [],
    createdById: 'u-tiago',
    createdAt: new Date(2026, 7, 22, 22, 11).toISOString(),
    updatedAt: new Date(2026, 7, 22, 22, 11).toISOString(),
    ...overrides,
  }) as EventReport;

function renderPage(as: UserRole = UserRole.EMERGENCY_OPERATIONAL) {
  const authProvider = {
    login: () => Promise.resolve(),
    logout: () => Promise.resolve(),
    checkAuth: () => Promise.resolve(),
    checkError: () => Promise.resolve(),
    getPermissions: () => Promise.resolve(as),
    getIdentity: () => Promise.resolve({ id: 'u-tiago', fullName: 'Tiago' } as never),
  };

  render(
    <MemoryRouter>
      <AdminContext dataProvider={testDataProvider()} authProvider={authProvider}>
        <MyReportsPage />
      </AdminContext>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  mockApiFetch.mockReset();
  mockApiFetch.mockResolvedValue({ data: [report()], total: 1 });
});

// ── The activities you were on ─────────────────────────────────────────────────
//
// A personal page, because reading the whole archive needs VIEW_EVENT_REPORTS
// and an operational does not have it. It is also where a new report starts.

describe('my reports', () => {
  it('asks only for the reports the caller was on', async () => {
    renderPage();
    expect(await screen.findByText('EMG 128/2026')).toBeInTheDocument();
    expect(mockApiFetch).toHaveBeenCalledWith('/event-reports/me?perPage=100');
  });

  it('summarises each one at a glance', async () => {
    renderPage();

    expect(await screen.findByText('EMG 128/2026')).toBeInTheDocument();
    expect(screen.getByText('Emergência')).toBeInTheDocument();
    expect(screen.getByText(/Taveiro/)).toBeInTheDocument();
    expect(screen.getByText(/CHUC — Hospital Geral/)).toBeInTheDocument();
    expect(screen.getByText(/42 km/)).toBeInTheDocument();
  });

  it('says so plainly when there are none yet', async () => {
    mockApiFetch.mockResolvedValue({ data: [], total: 0 });
    renderPage();

    expect(await screen.findByText(/ainda não tens relatórios/i)).toBeInTheDocument();
  });

  it('offers a new report to someone who may file one', async () => {
    renderPage();
    expect(await screen.findByRole('button', { name: /novo relatório/i })).toBeInTheDocument();
  });

  it('offers no new report to someone who may not', async () => {
    renderPage(UserRole.LOGISTICS_COORDINATOR);

    await screen.findByText('EMG 128/2026');
    expect(
      screen.queryByRole('button', { name: /novo relatório/i }),
    ).not.toBeInTheDocument();
  });

  it('says why when the list cannot be loaded', async () => {
    mockApiFetch.mockRejectedValue(new Error('offline'));
    renderPage();

    expect(await screen.findByText('offline')).toBeInTheDocument();
  });
});

describe('an unfinished draft', () => {
  it('is shown first and never buried', async () => {
    // It lives on this device only: if it is not on this screen, it is nowhere.
    saveDraft(emptyDraft(EventReportType.LOCAL_SUPPORT), 'crew');
    renderPage();

    expect(await screen.findByText(/rascunho por terminar/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continuar/i })).toBeInTheDocument();
  });

  it('is absent when there is nothing half-written', async () => {
    renderPage();

    await screen.findByText('EMG 128/2026');
    expect(screen.queryByText(/rascunho por terminar/i)).not.toBeInTheDocument();
  });
});
