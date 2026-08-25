import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminContext, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  EventLocationType,
  EventReport,
  EventReportType,
  Gender,
  VictimDestinationKind,
} from '@redinfo/shared';
import { EventReportShow } from './EventReportShow';
import { crewSummary, vehicleSummary, victimSummary } from './EventReportList';
import { apiFetch } from '../../api';
import { messages } from '../../i18n/i18nProvider';

// Pinned to 'pt' rather than the app's own locale-detecting singleton: jsdom
// reports `en-US`, which would otherwise render this screen in English and
// break every Portuguese assertion below.
const i18nProvider = polyglotI18nProvider(messages, 'pt');

/** The real Portuguese catalogue, so these pure functions are exercised the
 * same way a mounted component would call them. */
const t = i18nProvider.translate;

vi.mock('../../api', () => ({ apiFetch: vi.fn(), apiDownload: vi.fn() }));

const mockApiFetch = apiFetch as unknown as Mock;

const COIMBRA = {
  id: 'mun-coimbra',
  ineCode: '0603',
  name: 'Coimbra',
  district: 'Coimbra',
  latitude: 40.2111,
  longitude: -8.4289,
};

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
    locality: {
      id: 'loc-taveiro',
      name: 'Taveiro',
      municipalityId: COIMBRA.id,
      municipality: COIMBRA,
    },
    activationAt: new Date(2026, 7, 22, 20, 14).toISOString(),
    sceneArrivalAt: new Date(2026, 7, 22, 20, 26).toISOString(),
    sceneDepartureAt: null,
    hospitalArrivalAt: new Date(2026, 7, 22, 20, 53).toISOString(),
    availableAt: null,
    shift: {
      scheduleId: 'sch-1',
      date: '2026-08-22',
      slot: 1,
      label: '20:00–24:00',
      windowLabel: 'Emergency - August',
    },
    operationalReport: '<p>Vítima consciente após queda.</p>',
    crew: [
      {
        id: 'c1',
        userId: 'u-tiago',
        user: { id: 'u-tiago', firstName: 'Tiago', lastName: 'Lourenço' },
        roleName: 'Driver',
        position: 0,
      },
    ],
    vehicles: [
      {
        id: 'v1',
        vehicleId: 'veh-1',
        vehicle: { id: 'veh-1', licensePlate: 'AA-12-BC', numeroCauda: 'Amb. 04' },
        kilometres: 42,
        position: 0,
      },
    ],
    victims: [
      {
        id: 'vic1',
        position: 0,
        gender: Gender.FEMALE,
        age: 67,
        destinationKind: VictimDestinationKind.HOSPITAL,
        destinationHospitalId: 'hosp-1',
        destinationHospital: { id: 'hosp-1', name: 'CHUC — Hospital Geral' },
      },
    ],
    attachments: [],
    createdById: 'u-tiago',
    createdBy: { id: 'u-tiago', firstName: 'Tiago', lastName: 'Lourenço' },
    createdAt: new Date(2026, 7, 22, 22, 11).toISOString(),
    updatedAt: new Date(2026, 7, 22, 22, 11).toISOString(),
    ...overrides,
  }) as EventReport;

function renderShow(loaded: EventReport = report()) {
  mockApiFetch.mockResolvedValue(loaded);
  render(
    <MemoryRouter initialEntries={[`/event-reports/${loaded.id}/show`]}>
      <AdminContext dataProvider={testDataProvider()} i18nProvider={i18nProvider}>
        <Routes>
          <Route path="/event-reports/:id/show" element={<EventReportShow />} />
        </Routes>
      </AdminContext>
    </MemoryRouter>,
  );
}

beforeEach(() => mockApiFetch.mockReset());

// ── A filed report, as everyone else reads it ──────────────────────────────────

describe('the header', () => {
  it('shows the code the report is known by', async () => {
    renderShow();
    expect(await screen.findByText('EMG 128/2026')).toBeInTheDocument();
  });

  it('names the reference and the shift it came from', async () => {
    renderShow();
    expect(
      await screen.findByText(/2608 4471.*20:00–24:00|20:00–24:00/),
    ).toBeInTheDocument();
  });

  it('renders a support report with its own prefix', async () => {
    renderShow(report({ type: EventReportType.LOCAL_SUPPORT, number: 14 }));
    expect(await screen.findByText('APL 014/2026')).toBeInTheDocument();
  });
});

describe('the chronology', () => {
  it('shows the gap between consecutive stamps', async () => {
    renderShow();

    // Activation 20:14 → scene arrival 20:26.
    expect(await screen.findByText('12 min')).toBeInTheDocument();
  });

  it('measures across a blank rather than reading it as zero', async () => {
    renderShow();

    // Scene departure was never stamped, so the hospital arrival at 20:53 is
    // measured from the scene arrival at 20:26 — 27 minutes, not 0.
    expect(await screen.findByText('27 min')).toBeInTheDocument();
  });

  it('shows an unmarked stamp as blank, not as midnight', async () => {
    renderShow();
    expect(await screen.findAllByText('--:--')).not.toHaveLength(0);
  });

  it('is left out entirely on a support report', async () => {
    renderShow(
      report({
        type: EventReportType.LOCAL_SUPPORT,
        activationAt: null,
        sceneArrivalAt: null,
        hospitalArrivalAt: null,
      }),
    );

    await screen.findByText('APL 128/2026');
    expect(screen.queryByText('Ativação')).not.toBeInTheDocument();
  });
});

describe('the facts', () => {
  it('shows the hours, location type and locality', async () => {
    renderShow();

    expect(await screen.findByText('20:14 – 22:05')).toBeInTheDocument();
    expect(screen.getByText('Habitação')).toBeInTheDocument();
    expect(screen.getByText('Taveiro · Coimbra')).toBeInTheDocument();
  });

  it('shows the vehicle and its kilometres', async () => {
    renderShow();

    expect(await screen.findByText('AA-12-BC')).toBeInTheDocument();
    expect(screen.getByText('42 km')).toBeInTheDocument();
  });

  it('names the crew with their posts, translated', async () => {
    renderShow();

    expect(await screen.findByText('Tiago Lourenço')).toBeInTheDocument();
    expect(screen.getByText('Condutor')).toBeInTheDocument();
  });

  it('shows each victim with where they were taken', async () => {
    renderShow();

    expect(await screen.findByText('Feminino, 67 anos')).toBeInTheDocument();
    expect(screen.getByText('CHUC — Hospital Geral')).toBeInTheDocument();
  });

  it('says the outcome when nobody was transported', async () => {
    renderShow(
      report({
        victims: [
          {
            id: 'vic1',
            position: 0,
            gender: Gender.MALE,
            age: 30,
            destinationKind: VictimDestinationKind.REFUSED_TRANSPORT,
            destinationHospitalId: null,
            destinationHospital: null,
          },
        ],
      }),
    );

    expect(await screen.findByText('Recusou transporte')).toBeInTheDocument();
  });

  it('renders the narrative as formatted text', async () => {
    renderShow();
    expect(await screen.findByText(/Vítima consciente após queda/)).toBeInTheDocument();
  });

  it('says so when there was no victim', async () => {
    renderShow(report({ victims: [] }));
    expect(await screen.findByText(/não houve vítima/i)).toBeInTheDocument();
  });
});

describe('when it cannot be loaded', () => {
  it('says why rather than spinning forever', async () => {
    mockApiFetch.mockRejectedValue(new Error('Report not found'));
    render(
      <MemoryRouter initialEntries={['/event-reports/nope/show']}>
        <AdminContext dataProvider={testDataProvider()} i18nProvider={i18nProvider}>
          <Routes>
            <Route path="/event-reports/:id/show" element={<EventReportShow />} />
          </Routes>
        </AdminContext>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Report not found')).toBeInTheDocument();
  });
});

// ── The list's one-line summaries ─────────────────────────────────────────────
//
// Pure functions, so they are tested directly rather than through a datagrid.

describe('victimSummary', () => {
  it('names the hospital when there was one victim', () => {
    expect(victimSummary(t, report())).toBe('1 · CHUC — Hospital Geral');
  });

  it('names the outcome when that victim was not transported', () => {
    expect(
      victimSummary(
        t,
        report({
          victims: [
            {
              id: 'v',
              position: 0,
              gender: Gender.MALE,
              age: 30,
              destinationKind: VictimDestinationKind.TREATED_ON_SCENE,
              destinationHospitalId: null,
              destinationHospital: null,
            },
          ],
        }),
      ),
    ).toBe('1 · Tratado no local');
  });

  it('counts how many were transported once there is more than one', () => {
    expect(
      victimSummary(
        t,
        report({
          victims: [
            {
              id: 'a',
              position: 0,
              gender: Gender.FEMALE,
              age: 67,
              destinationKind: VictimDestinationKind.HOSPITAL,
              destinationHospitalId: 'h',
              destinationHospital: { id: 'h', name: 'CHUC' },
            },
            {
              id: 'b',
              position: 1,
              gender: Gender.MALE,
              age: 14,
              destinationKind: VictimDestinationKind.TREATED_ON_SCENE,
              destinationHospitalId: null,
              destinationHospital: null,
            },
            {
              id: 'c',
              position: 2,
              gender: Gender.UNKNOWN,
              age: 40,
              destinationKind: VictimDestinationKind.REFUSED_TRANSPORT,
              destinationHospitalId: null,
              destinationHospital: null,
            },
          ],
        }),
      ),
    ).toBe('3 · 1');
  });

  it('is a dash when there was nobody', () => {
    expect(victimSummary(t, report({ victims: [] }))).toBe('—');
  });
});

describe('vehicleSummary', () => {
  it('names the plate and the kilometres for one vehicle', () => {
    expect(vehicleSummary(t, report())).toBe('AA-12-BC · 42 km');
  });

  it('counts vehicles and totals the kilometres once there are several', () => {
    expect(
      vehicleSummary(
        t,
        report({
          vehicles: [
            {
              id: 'a',
              vehicleId: 'veh-a',
              vehicle: { id: 'veh-a', licensePlate: 'AA-12-BC', numeroCauda: '1' },
              kilometres: 51,
              position: 0,
              isOverridden: false,
            },
            {
              id: 'b',
              vehicleId: 'veh-b',
              vehicle: { id: 'veh-b', licensePlate: '34-XY-90', numeroCauda: '2' },
              kilometres: 36,
              position: 1,
              isOverridden: false,
            },
          ],
        }),
      ),
    ).toBe('2 · 87 km');
  });

  it('is a dash when no vehicle went out', () => {
    expect(vehicleSummary(t, report({ vehicles: [] }))).toBe('—');
  });
});

describe('crewSummary', () => {
  const member = (id: string, lastName: string) => ({
    id,
    userId: id,
    user: { id, firstName: 'X', lastName },
    roleName: null,
    position: 0,
  });

  it('lists surnames, which is how a coordinator scans a rota', () => {
    expect(crewSummary(t, report({ crew: [member('a', 'Lourenço')] }))).toBe('Lourenço');
    expect(
      crewSummary(t, report({ crew: [member('a', 'Lourenço'), member('b', 'Ribeiro')] })),
    ).toBe('Lourenço · Ribeiro');
  });

  it('abbreviates past two, so the column stays readable', () => {
    expect(
      crewSummary(
        t,
        report({
          crew: [member('a', 'Lourenço'), member('b', 'Ribeiro'), member('c', 'Antunes')],
        }),
      ),
    ).toBe('Lourenço · Ribeiro · +1');
  });

  it('is a dash when nobody is listed', () => {
    expect(crewSummary(t, report({ crew: [] }))).toBe('—');
  });
});
