import { describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AdminContext, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import userEvent from '@testing-library/user-event';
import {
  Patient,
  PatientMobility,
  TransportRequest,
  TransportRequestDecision,
  TransportRequestFeasibility,
  TransportRequestOccurrenceType,
  TransportRequestVehicleType,
  VehicleOccupancySource,
  VehicleType,
} from '@redinfo/shared';
import { messages } from '../i18n/i18nProvider';
import { TransportReferralsPage } from './TransportReferralsPage';
import { apiFetch } from '../api';

vi.mock('../api', () => ({
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

vi.mock('react-admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-admin')>()),
  Title: () => null,
}));

const mockApiFetch = apiFetch as unknown as Mock;

const i18nProvider = polyglotI18nProvider(messages, 'en');

// ── The decision page (#229) ────────────────────────────────────────────────
//
// Builds on the ageing queue and `decide` from referral intake (#228):
// two lists (pending, and accepted-but-not-registered-externally), a
// feasibility snapshot for whichever referral is selected, and the three
// actions (accept, reject, register externally) against the endpoints
// `TransportRequestsService` exposes.

const referral = (overrides: Partial<TransportRequest> = {}): TransportRequest =>
  ({
    id: 'tr-1',
    batchReference: 'Email 12345',
    communicatedAt: '2026-09-10T17:00:00.000Z',
    requesterAccountCode: 'AZP',
    responseDueAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    externalServiceNumber: 'SVC-001',
    appointmentAt: '2026-09-12T09:00:00.000Z',
    requestingOrganisationId: 'org-requester',
    requestingOrganisation: { id: 'org-requester', name: 'AXA Assistance' } as never,
    payingOrganisationId: 'org-payer',
    patientId: 'pat-1',
    occurrenceType: TransportRequestOccurrenceType.CONSULTA,
    requestedVehicleType: TransportRequestVehicleType.TRANSPORTE,
    escortTravels: false,
    isRoundTrip: true,
    originAddress: 'Rua das Flores, 10',
    destinationFacilityId: 'fac-1',
    destinationFacility: { id: 'fac-1', name: 'CHUC — Hospital Geral' } as never,
    decision: TransportRequestDecision.PENDING,
    minutesUntilResponseDue: 30,
    createdById: 'user-1',
    createdAt: '2026-09-10T17:05:00.000Z',
    updatedAt: '2026-09-10T17:05:00.000Z',
    ...overrides,
  }) as TransportRequest;

const patient: Patient = {
  id: 'pat-1',
  mobility: PatientMobility.WALKING,
  createdById: 'user-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  identity: { fullName: 'Maria Fernandes' },
} as never;

const feasibility: TransportRequestFeasibility = {
  date: '2026-09-12',
  roster: [{ userId: 'u-1', firstName: 'Ana', lastName: 'Silva', roleName: 'Driver' }],
  absentStaff: [],
  committedVehicles: [
    {
      vehicleId: 'veh-busy',
      licensePlate: 'CC-11-DD',
      numeroCauda: '02',
      vehicleType: VehicleType.TRANSPORT,
      startsAt: '2026-09-12T08:00:00.000Z',
      endsAt: '2026-09-12T12:00:00.000Z',
      source: VehicleOccupancySource.SCHEDULE_SHIFT,
      sourceId: 'sched-1',
    },
  ],
  freeVehiclesByType: [
    { vehicleType: VehicleType.EMERGENCY, vehicles: [] },
    { vehicleType: VehicleType.TRANSPORT, vehicles: [{ id: 'veh-free', licensePlate: 'AA-00-BB', numeroCauda: '01' }] },
  ],
  requestedVehicleTypeFree: true,
};

function mockEndpoints(overrides: { queue?: TransportRequest[]; undispatched?: TransportRequest[] } = {}) {
  const queue = overrides.queue ?? [referral()];
  const undispatched = overrides.undispatched ?? [];
  mockApiFetch.mockImplementation((path: string, options?: { method?: string }) => {
    if (path.includes('decision=PENDING')) return Promise.resolve({ data: queue, total: queue.length });
    if (path.includes('awaitingExternalRegistration=true')) {
      return Promise.resolve({ data: undispatched, total: undispatched.length });
    }
    if (path.startsWith('/patients/')) return Promise.resolve(patient);
    if (path.endsWith('/feasibility')) return Promise.resolve(feasibility);
    if (path.endsWith('/decide') && options?.method === 'POST') return Promise.resolve(referral({ decision: TransportRequestDecision.ACCEPTED }));
    if (path.endsWith('/register-external') && options?.method === 'POST') {
      return Promise.resolve(referral({ decision: TransportRequestDecision.ACCEPTED, externallyRegisteredAt: new Date().toISOString() }));
    }
    return Promise.reject(new Error(`unexpected path ${path}`));
  });
}

const renderPage = () =>
  render(
    <AdminContext dataProvider={testDataProvider()} i18nProvider={i18nProvider}>
      <TransportReferralsPage />
    </AdminContext>,
  );

describe('the referral decision page', () => {
  it('lists the pending queue and shows the empty undispatched section', async () => {
    mockEndpoints();
    renderPage();

    expect(await screen.findByText('SVC-001')).toBeInTheDocument();
    expect(screen.getByText('Everything is registered externally.')).toBeInTheDocument();
  });

  it('shows the persistent undispatched section separately from the queue', async () => {
    mockEndpoints({
      queue: [],
      undispatched: [referral({ id: 'tr-2', externalServiceNumber: 'SVC-002', decision: TransportRequestDecision.ACCEPTED })],
    });
    renderPage();

    expect(await screen.findByText('SVC-002')).toBeInTheDocument();
    expect(screen.getByText('No referrals awaiting decision.')).toBeInTheDocument();
  });

  it('selecting a referral fetches its feasibility and the patient name', async () => {
    mockEndpoints();
    renderPage();

    await userEvent.click(await screen.findByText('SVC-001'));

    expect(await screen.findByText('Maria Fernandes')).toBeInTheDocument();
    expect(await screen.findByText(/Availability on 2026-09-12/)).toBeInTheDocument();
    expect(screen.getByText('The requested vehicle type has availability.')).toBeInTheDocument();
  });

  it('accepting calls decide with ACCEPTED', async () => {
    mockEndpoints();
    renderPage();

    await userEvent.click(await screen.findByText('SVC-001'));
    await userEvent.click(await screen.findByRole('button', { name: 'Accept' }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/transport-requests/tr-1/decide',
        expect.objectContaining({ method: 'POST', body: { decision: TransportRequestDecision.ACCEPTED, rejectionReason: undefined } }),
      ),
    );
  });

  it('rejecting requires typing a reason first', async () => {
    mockEndpoints();
    renderPage();

    await userEvent.click(await screen.findByText('SVC-001'));
    await userEvent.click(await screen.findByRole('button', { name: 'Reject' }));

    const confirmButton = screen.getByRole('button', { name: 'Confirm rejection' });
    expect(confirmButton).toBeDisabled();

    await userEvent.type(screen.getByLabelText('Reason'), 'Fora do prazo');
    expect(confirmButton).toBeEnabled();
    await userEvent.click(confirmButton);

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/transport-requests/tr-1/decide',
        expect.objectContaining({
          method: 'POST',
          body: { decision: TransportRequestDecision.REJECTED, rejectionReason: 'Fora do prazo' },
        }),
      ),
    );
  });

  it('offers the register-externally action only once accepted and not yet registered', async () => {
    mockEndpoints({
      queue: [],
      undispatched: [referral({ id: 'tr-2', externalServiceNumber: 'SVC-002', decision: TransportRequestDecision.ACCEPTED })],
    });
    renderPage();

    await userEvent.click(await screen.findByText('SVC-002'));
    const button = await screen.findByRole('button', { name: 'Mark registered on external platform' });
    await userEvent.click(button);

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/transport-requests/tr-2/register-external', { method: 'POST' }),
    );
  });
});
