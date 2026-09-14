import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminContext, ResourceContextProvider, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  LegCancellationSource,
  LegDirection,
  LegStatus,
  TransportLeg,
  TransportRequest,
  TransportRequestDecision,
  TransportRequestOccurrenceType,
  TransportRequestVehicleType,
  TreatmentPlan,
  UserRole,
} from '@redinfo/shared';
import { TransportRequestShow } from './TransportRequestShow';
import { apiFetch } from '../../api';
import { messages } from '../../i18n/i18nProvider';

vi.mock('../../api', () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(
      message: string,
      public status: number,
      public code?: string,
      public params?: Record<string, unknown>,
    ) {
      super(message);
    }
  },
}));

const i18nProvider = polyglotI18nProvider(messages, 'en');
const mockApiFetch = apiFetch as unknown as Mock;

// ── The request detail (#230) ───────────────────────────────────────────────
//
// `TreatmentPlanPanel` and `TransportLegPanel` never share state directly —
// this exercises the whole screen so their wiring through `TransportRequestShow`
// (a plan create/update bumping the leg list's reload token) is covered too,
// not just each panel in isolation.

const REQUEST: TransportRequest = {
  id: 'tr-1',
  batchReference: 'Email 12345',
  communicatedAt: '2026-09-10T17:00:00.000Z',
  requesterAccountCode: 'AZP',
  responseDueAt: '2026-09-11T05:00:00.000Z',
  externalServiceNumber: 'SVC-001',
  appointmentAt: '2026-09-12T09:00:00.000Z',
  requestingOrganisationId: 'org-requester',
  requestingOrganisation: { id: 'org-requester', name: 'AXA Assistance' } as never,
  payingOrganisationId: 'org-payer',
  patientId: 'pat-1',
  occurrenceType: TransportRequestOccurrenceType.TRATAMENTO,
  requestedVehicleType: TransportRequestVehicleType.TRANSPORTE,
  escortTravels: false,
  isRoundTrip: true,
  originAddress: 'Rua das Flores, 10',
  destinationFacilityId: 'fac-1',
  destinationFacility: { id: 'fac-1', name: 'CHUC — Hospital Geral' } as never,
  decision: TransportRequestDecision.ACCEPTED,
  minutesUntilResponseDue: 45,
  createdById: 'user-1',
  createdAt: '2026-09-10T17:05:00.000Z',
  updatedAt: '2026-09-10T17:05:00.000Z',
} as TransportRequest;

const FACILITY = { id: 'fac-1', name: 'CHUC — Hospital Geral' };

const PLAN: TreatmentPlan = {
  id: 'plan-1',
  transportRequestId: 'tr-1',
  destinationFacilityId: 'fac-1',
  destinationFacility: FACILITY as never,
  daysOfWeek: [1, 3],
  treatmentStartTime: '09:00',
  treatmentEndTime: '11:00',
  validFrom: '2026-09-14',
  validTo: '2026-10-14',
  notes: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

const LEG: TransportLeg = {
  id: 'leg-1',
  transportRequestId: 'tr-1',
  treatmentPlanId: 'plan-1',
  date: '2026-09-14',
  generatedForDate: '2026-09-14',
  direction: LegDirection.OUTBOUND,
  originAddress: 'Rua das Flores, 10',
  originLatitude: null,
  originLongitude: null,
  originFacilityId: null,
  destinationAddress: null,
  destinationLatitude: null,
  destinationLongitude: null,
  destinationFacilityId: 'fac-1',
  destinationFacility: FACILITY as never,
  plannedPickupAt: null,
  plannedDropoffAt: null,
  actualPickupAt: null,
  actualDropoffAt: null,
  status: LegStatus.PLANNED,
  cancellationReason: null,
  cancellationSource: null,
  estimatedEndAt: null,
  estimatedEndSource: null,
  effectiveEstimatedEndAt: '2026-09-14T09:30:00.000Z',
  arrivalWindowWarning: null,
  tripStopId: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

function mockEndpoints(overrides: { plans?: TreatmentPlan[]; legs?: TransportLeg[] } = {}) {
  const plans = overrides.plans ?? [];
  const legs = overrides.legs ?? [];
  mockApiFetch.mockImplementation((path: string, options?: { method?: string; body?: unknown }) => {
    if (path === '/facilities/transport') return Promise.resolve([FACILITY]);
    if (path === '/transport-requests/tr-1/treatment-plans' && (!options || options.method === undefined)) {
      return Promise.resolve(plans);
    }
    if (path === '/transport-requests/tr-1/treatment-plans' && options?.method === 'POST') {
      return Promise.resolve({ ...PLAN, id: 'plan-new' });
    }
    if (path.startsWith('/transport-requests/treatment-plans/') && options?.method === 'PATCH') {
      return Promise.resolve(PLAN);
    }
    if (path === '/transport-requests/tr-1/legs') return Promise.resolve(legs);
    if (path === '/transport-requests/tr-1/legs/generate-one-off' && options?.method === 'POST') {
      return Promise.resolve(2);
    }
    if (path.match(/\/transport-requests\/legs\/.+\/cancel/) && options?.method === 'POST') {
      return Promise.resolve({ ...LEG, status: LegStatus.CANCELLED });
    }
    if (path.match(/\/transport-requests\/legs\/.+\/no-show/) && options?.method === 'POST') {
      return Promise.resolve({ ...LEG, status: LegStatus.NO_SHOW });
    }
    if (path.match(/\/transport-requests\/legs\/[^/]+$/) && options?.method === 'PATCH') {
      return Promise.resolve(LEG);
    }
    return Promise.reject(new Error(`unexpected path ${path} ${options?.method ?? 'GET'}`));
  });
}

function renderShow(roles: UserRole[] = [UserRole.TRANSPORT_COORDINATOR]) {
  const dataProvider = testDataProvider({
    getOne: vi.fn(() => Promise.resolve({ data: REQUEST })) as never,
  });
  const authProvider = {
    login: () => Promise.resolve(),
    logout: () => Promise.resolve(),
    checkAuth: () => Promise.resolve(),
    checkError: () => Promise.resolve(),
    getPermissions: () => Promise.resolve(roles),
  };
  render(
    <MemoryRouter initialEntries={['/transport-requests/tr-1/show']}>
      <AdminContext dataProvider={dataProvider} authProvider={authProvider} i18nProvider={i18nProvider}>
        <ResourceContextProvider value="transport-requests">
          <Routes>
            <Route path="/transport-requests/:id/show" element={<TransportRequestShow />} />
          </Routes>
        </ResourceContextProvider>
      </AdminContext>
    </MemoryRouter>,
  );
}

describe('the transport request detail', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  it('is hidden from someone without MANAGE_TRANSPORT_REQUESTS', async () => {
    mockEndpoints();
    renderShow([UserRole.EMERGENCY_OPERATIONAL]);

    await screen.findByText('SVC-001');
    expect(screen.queryByText('Treatment plan')).not.toBeInTheDocument();
    expect(screen.queryByText('Legs')).not.toBeInTheDocument();
  });

  it('offers to generate a one-off leg when there is no plan and none yet', async () => {
    mockEndpoints();
    renderShow();

    expect(await screen.findByRole('button', { name: /generate one-off leg/i })).toBeInTheDocument();
  });

  it('does not offer one-off generation once a plan exists', async () => {
    mockEndpoints({ plans: [PLAN], legs: [LEG] });
    renderShow();

    await screen.findByText(LEG.date);
    expect(screen.queryByRole('button', { name: /generate one-off leg/i })).not.toBeInTheDocument();
  });

  it('generates a one-off leg', async () => {
    mockEndpoints();
    const user = userEvent.setup();
    renderShow();

    await user.click(await screen.findByRole('button', { name: /generate one-off leg/i }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/transport-requests/tr-1/legs/generate-one-off',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
  });

  it('creates a treatment plan', async () => {
    mockEndpoints();
    const user = userEvent.setup();
    renderShow();

    await user.click(await screen.findByRole('button', { name: /add plan/i }));

    const facilityInput = await screen.findByLabelText('Treatment facility');
    await user.click(facilityInput);
    await user.click(await screen.findByRole('option', { name: FACILITY.name }));

    await user.click(screen.getByRole('button', { name: 'Mon' }));
    await user.type(screen.getByLabelText('Start time'), '09:00');
    await user.type(screen.getByLabelText('Valid from'), '2026-09-14');
    await user.type(screen.getByLabelText('Valid to'), '2026-10-14');

    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/transport-requests/tr-1/treatment-plans',
        expect.objectContaining({
          method: 'POST',
          body: expect.objectContaining({ destinationFacilityId: 'fac-1', daysOfWeek: [1] }),
        }),
      ),
    );
  });

  it('lists an existing leg with its direction and status', async () => {
    mockEndpoints({ plans: [PLAN], legs: [LEG] });
    renderShow();

    expect(await screen.findByText(LEG.date)).toBeInTheDocument();
    expect(screen.getByText('Outbound')).toBeInTheDocument();
    expect(screen.getByText('Planned')).toBeInTheDocument();
  });

  it('cancels a leg with a reason and source', async () => {
    mockEndpoints({ plans: [PLAN], legs: [LEG] });
    const user = userEvent.setup();
    renderShow();

    await user.click(await screen.findByRole('button', { name: /cancel leg/i }));
    await user.type(screen.getByLabelText('Reason'), 'Patient admitted');
    await user.click(screen.getByRole('button', { name: /confirm cancellation/i }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/transport-requests/legs/leg-1/cancel',
        expect.objectContaining({
          method: 'POST',
          body: { reason: 'Patient admitted', source: LegCancellationSource.PATIENT },
        }),
      ),
    );
  });

  it('marks a leg as a no-show after confirming', async () => {
    mockEndpoints({ plans: [PLAN], legs: [LEG] });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    renderShow();

    await user.click(await screen.findByRole('button', { name: /mark no-show/i }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/transport-requests/legs/leg-1/no-show',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
  });

  it('does not mark a no-show without confirming', async () => {
    mockEndpoints({ plans: [PLAN], legs: [LEG] });
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    renderShow();

    await user.click(await screen.findByRole('button', { name: /mark no-show/i }));

    expect(mockApiFetch).not.toHaveBeenCalledWith(
      '/transport-requests/legs/leg-1/no-show',
      expect.anything(),
    );
  });
});
