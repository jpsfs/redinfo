import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { AdminContext, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import userEvent from '@testing-library/user-event';
import {
  LegDirection,
  LegStatus,
  PatientMobility,
  TransportPlanningBoard,
  TripStatus,
  TripStopKind,
  VehicleType,
} from '@redinfo/shared';
import { messages } from '../i18n/i18nProvider';
import { TransportPlanningPage } from './TransportPlanningPage';
import { apiFetch, ApiError } from '../api';

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

const LEG_UNASSIGNED = {
  id: 'leg-unassigned',
  transportRequestId: 'req-1',
  treatmentPlanId: null,
  date: '2026-09-15',
  generatedForDate: '2026-09-15',
  direction: LegDirection.OUTBOUND,
  originAddress: 'Rua A, 1',
  originLatitude: null,
  originLongitude: null,
  originFacilityId: null,
  destinationAddress: null,
  destinationLatitude: null,
  destinationLongitude: null,
  destinationFacilityId: 'fac-1',
  plannedPickupAt: '2026-09-15T08:00:00.000Z',
  plannedDropoffAt: '2026-09-15T08:30:00.000Z',
  actualPickupAt: null,
  actualDropoffAt: null,
  status: LegStatus.PLANNED,
  cancellationReason: null,
  cancellationSource: null,
  estimatedEndAt: null,
  estimatedEndSource: null,
  effectiveEstimatedEndAt: '2026-09-15T09:00:00.000Z',
  arrivalWindowWarning: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  patientId: 'pat-1',
  patientMobility: PatientMobility.WHEELCHAIR,
  patientName: 'Maria Costa',
};

const board = (overrides: Partial<TransportPlanningBoard> = {}): TransportPlanningBoard => ({
  date: '2026-09-15',
  lanes: [
    {
      trip: {
        id: 'trip-1',
        date: '2026-09-15',
        vehicleId: 'veh-1',
        status: TripStatus.PLANNED,
        notes: null,
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
      vehicle: {
        id: 'veh-1',
        licensePlate: 'AA-11-BB',
        numeroCauda: '101',
        vehicleType: VehicleType.TRANSPORT,
        seatedCapacity: 3,
        wheelchairPositions: 1,
        stretcherPositions: 0,
      },
      crewMembers: [],
      stops: [],
      occupancyWindow: null,
      emptyLegs: [],
      issues: [],
    },
  ],
  legsById: { [LEG_UNASSIGNED.id]: LEG_UNASSIGNED as never },
  unassignedLegIds: [LEG_UNASSIGNED.id],
  ...overrides,
});

const renderPage = () =>
  render(
    <AdminContext dataProvider={testDataProvider()} i18nProvider={polyglotI18nProvider(messages, 'en')}>
      <TransportPlanningPage />
    </AdminContext>,
  );

describe('TransportPlanningPage', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  it('loads the board and shows the unassigned leg and the vehicle lane', async () => {
    mockApiFetch.mockImplementation((path: string) =>
      Promise.resolve(path.startsWith('/trips/board') ? board() : []),
    );
    renderPage();

    expect(await screen.findByText('Maria Costa')).toBeInTheDocument();
    expect(screen.getByText('101')).toBeInTheDocument();
    expect(screen.getByText('AA-11-BB')).toBeInTheDocument();
  });

  it('assigns a leg to a lane through the keyboard-accessible dialog', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockImplementation((path: string, options?: { method?: string }) => {
      if (path.startsWith('/trips/board')) return Promise.resolve(board());
      if (path.startsWith('/vehicle-occupancy')) return Promise.resolve([]);
      if (path === '/trips/trip-1/legs' && options?.method === 'POST') return Promise.resolve({});
      return Promise.resolve([]);
    });
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Assign' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByLabelText('Vehicle'));
    await user.click(await screen.findByRole('option', { name: /101/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/trips/trip-1/legs',
        expect.objectContaining({
          method: 'POST',
          body: expect.objectContaining({ transportLegId: 'leg-unassigned' }),
        }),
      ),
    );
  });

  it('reveals the override-reason field and blocks confirm until one is typed, after a vehicle conflict', async () => {
    const user = userEvent.setup();
    let assignAttempts = 0;
    mockApiFetch.mockImplementation((path: string, options?: { method?: string }) => {
      if (path.startsWith('/trips/board')) return Promise.resolve(board());
      if (path.startsWith('/vehicle-occupancy')) return Promise.resolve([]);
      if (path === '/trips/trip-1/legs' && options?.method === 'POST') {
        assignAttempts += 1;
        if (assignAttempts === 1) {
          return Promise.reject(new ApiError('Vehicle already committed for an overlapping interval', 409));
        }
        return Promise.resolve({});
      }
      return Promise.resolve([]);
    });
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Assign' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByLabelText('Vehicle'));
    await user.click(await screen.findByRole('option', { name: /101/ }));
    const confirmButton = within(dialog).getByRole('button', { name: 'Confirm' });
    await user.click(confirmButton);

    expect(await within(dialog).findByLabelText('Override reason')).toBeInTheDocument();
    expect(confirmButton).toBeDisabled();

    await user.type(within(dialog).getByLabelText('Override reason'), 'Cleared with the other coordinator');
    expect(confirmButton).not.toBeDisabled();
    await user.click(confirmButton);

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/trips/trip-1/legs',
        expect.objectContaining({
          method: 'POST',
          body: expect.objectContaining({ vehicleOverrideReason: 'Cleared with the other coordinator' }),
        }),
      ),
    );
  });
});
