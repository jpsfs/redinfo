import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { AdminContext, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import {
  LegDirection,
  LegStatus,
  PatientMobility,
  STANDARD_TRIP_CREW_REQUIREMENT,
  TransportPlanningBoard,
  TripStatus,
  TripStopKind,
  VehicleType,
} from '@redinfo/shared';
import { messages } from '../i18n/i18nProvider';
import { TransportPlanningBuildPage } from './TransportPlanningBuildPage';
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

const FACILITY = { id: 'fac-1', name: 'Hospital de São João' };

const leg = (id: string, patientName: string, overrides: Record<string, unknown> = {}) => ({
  id,
  transportRequestId: 'req-1',
  treatmentPlanId: null,
  date: '2026-09-15',
  generatedForDate: '2026-09-15',
  direction: LegDirection.OUTBOUND,
  originAddress: 'Rua A, 1',
  originLatitude: 41.5,
  originLongitude: -8.6,
  originFacilityId: null,
  destinationAddress: null,
  destinationLatitude: 41.18,
  destinationLongitude: -8.6,
  destinationFacilityId: FACILITY.id,
  destinationFacility: FACILITY,
  plannedPickupAt: null,
  plannedDropoffAt: null,
  actualPickupAt: null,
  actualDropoffAt: null,
  status: LegStatus.PLANNED,
  cancellationReason: null,
  cancellationSource: null,
  estimatedEndAt: null,
  estimatedEndSource: null,
  appointmentAt: '2026-09-15T09:00:00.000Z',
  effectiveEstimatedEndAt: '2026-09-15T10:30:00.000Z',
  arrivalWindowWarning: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  patientId: `pat-${id}`,
  patientMobility: PatientMobility.AMBULATORY,
  patientName,
  travelMinutes: 45,
  travelEstimated: false,
  suggested: { pickupAt: '2026-09-15T07:57:30.000Z', dropoffAt: '2026-09-15T08:42:30.000Z' },
  ...overrides,
});

const VEHICLE = { id: 'veh-1', licensePlate: 'AA-11-BB', numeroCauda: '101' };

const lane = (overrides: Record<string, unknown> = {}) => ({
  trip: {
    id: 'trip-1',
    date: '2026-09-15',
    vehicleId: VEHICLE.id,
    status: TripStatus.PLANNED,
    notes: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  journeyNumber: 1,
  vehicle: {
    ...VEHICLE,
    vehicleType: VehicleType.TRANSPORT,
    seatedCapacity: 3,
    wheelchairPositions: 1,
    stretcherPositions: 0,
  },
  crewMembers: [],
  crewRequirement: STANDARD_TRIP_CREW_REQUIREMENT,
  stops: [],
  occupancyWindow: null,
  emptyLegs: [],
  issues: [],
  ...overrides,
});

const board = (overrides: Partial<TransportPlanningBoard> = {}): TransportPlanningBoard =>
  ({
    date: '2026-09-15',
    lanes: [lane()],
    legsById: { 'leg-1': leg('leg-1', 'Maria Costa') },
    unassignedLegIds: ['leg-1'],
    ...overrides,
  }) as never;

const crewCandidate = (overrides: Record<string, unknown> = {}) => ({
  userId: 'user-1',
  firstName: 'Inês',
  lastName: 'Marques',
  certifications: [],
  absent: false,
  crewingTripIds: [],
  onRoster: true,
  ...overrides,
});

const respond = (boardResult = board(), crew: unknown[] = [crewCandidate()]) =>
  mockApiFetch.mockImplementation((path: string) =>
    Promise.resolve(path.startsWith('/trips/board') ? boardResult : path.startsWith('/trips/crew-candidates') ? crew : []),
  );

const renderPage = (initialEntry = '/?date=2026-09-15') =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AdminContext dataProvider={testDataProvider()} i18nProvider={polyglotI18nProvider(messages, 'en')}>
        <TransportPlanningBuildPage />
      </AdminContext>
    </MemoryRouter>,
  );

describe('TransportPlanningBuildPage', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  it('reads its date from the URL, like the rest of the transport-planning family', async () => {
    respond();
    renderPage('/?date=2026-09-20');

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/trips/board?date=2026-09-20'));
    expect(mockApiFetch).toHaveBeenCalledWith('/trips/crew-candidates?date=2026-09-20');
  });

  it('counts what is still to place and how far the day has got', async () => {
    const placed = leg('leg-placed', 'João Silva');
    respond(
      board({
        lanes: [
          lane({
            stops: [
              {
                id: 'stop-1',
                tripId: 'trip-1',
                sequence: 1,
                kind: TripStopKind.PICKUP,
                transportLegId: 'leg-placed',
                facilityId: null,
                address: null,
                latitude: null,
                longitude: null,
                plannedAt: '2026-09-15T08:00:00.000Z',
                actualAt: null,
                dwellDecision: null,
                dwellMinutes: null,
                createdAt: '2026-09-01T00:00:00.000Z',
                updatedAt: '2026-09-01T00:00:00.000Z',
              },
            ],
          }),
        ],
        legsById: { 'leg-1': leg('leg-1', 'Maria Costa'), 'leg-placed': placed },
        unassignedLegIds: ['leg-1'],
      } as never),
    );
    renderPage();

    expect(await screen.findByText('1 of 2 people placed')).toBeInTheDocument();
  });

  /**
   * The reason this page exists: on the board, a journey with nobody on it is
   * only discoverable by opening a dialog on it. Here it is a number at the
   * top of the page, before any placing has been done.
   */
  it('surfaces a journey with no crew as a headline number and a filled action', async () => {
    respond();
    renderPage();

    expect(await screen.findByText('No crew')).toBeInTheDocument();
    expect(within(screen.getByTestId('tile-crew-short')).getByText('1')).toBeInTheDocument();
    expect(screen.getByText('0/1')).toBeInTheDocument();
  });

  it('counts a fully crewed journey as ready', async () => {
    respond(
      board({
        lanes: [lane({ crewMembers: [{ id: 'cm-1', userId: 'user-1', firstName: 'Inês', lastName: 'Marques' }] })],
      } as never),
    );
    renderPage();

    expect(await screen.findByText('1/1')).toBeInTheDocument();
    expect(within(screen.getByTestId('tile-crew-short')).getByText('0')).toBeInTheDocument();
  });

  it('opens the single-person dialog from a group row, not the whole-group one', async () => {
    const user = userEvent.setup();
    respond();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Assign Maria Costa' }));

    const dialog = await screen.findByRole('dialog');
    // The per-person dialog picks a vehicle for one leg; the group dialog
    // would have been titled for the group instead.
    expect(within(dialog).getByLabelText('Vehicle')).toBeInTheDocument();
  });

  it('says so plainly when there is nothing left to place', async () => {
    respond(board({ unassignedLegIds: [], legsById: {} } as never));
    renderPage();

    expect(await screen.findByText('Everything is placed for this date.')).toBeInTheDocument();
  });

  it('surfaces a load failure instead of rendering an empty day', async () => {
    mockApiFetch.mockRejectedValue(new ApiError('nope', 500));
    renderPage();

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
