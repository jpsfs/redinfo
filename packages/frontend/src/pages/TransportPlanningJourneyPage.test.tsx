import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminContext, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  LegDirection,
  LegStatus,
  PatientMobility,
  STANDARD_TRIP_CREW_REQUIREMENT,
  TripJourneyDetail,
  TripStatus,
  TripStopKind,
  VehicleType,
} from '@redinfo/shared';
import { messages } from '../i18n/i18nProvider';
import { TransportPlanningJourneyPage } from './TransportPlanningJourneyPage';
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

const LEG = {
  id: 'leg-1',
  transportRequestId: 'req-1',
  treatmentPlanId: null,
  date: '2026-09-15',
  generatedForDate: '2026-09-15',
  direction: LegDirection.OUTBOUND,
  originAddress: null,
  originLatitude: null,
  originLongitude: null,
  originFacilityId: null,
  originFacility: null,
  destinationAddress: null,
  destinationLatitude: null,
  destinationLongitude: null,
  destinationFacilityId: FACILITY.id,
  destinationFacility: FACILITY,
  plannedPickupAt: '2026-09-15T08:00:00.000Z',
  plannedDropoffAt: '2026-09-15T08:45:00.000Z',
  actualPickupAt: null,
  actualDropoffAt: null,
  status: LegStatus.ASSIGNED,
  cancellationReason: null,
  cancellationSource: null,
  estimatedEndAt: null,
  estimatedEndSource: null,
  appointmentAt: '2026-09-15T09:00:00.000Z',
  effectiveEstimatedEndAt: '2026-09-15T10:30:00.000Z',
  arrivalWindowWarning: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  patientId: 'pat-1',
  patientMobility: PatientMobility.WHEELCHAIR,
  patientName: 'Maria Costa',
  travelMinutes: 45,
  travelEstimated: false,
  travelDistanceMeters: 30_000,
  suggested: { pickupAt: null, dropoffAt: null },
};

const journey = (overrides: Partial<TripJourneyDetail> = {}): TripJourneyDetail => ({
  trip: {
    id: 'trip-1',
    date: '2026-09-15',
    vehicleId: 'veh-1',
    status: TripStatus.PLANNED,
    notes: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  journeyNumber: 2,
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
  crewRequirement: STANDARD_TRIP_CREW_REQUIREMENT,
  stops: [
    {
      id: 'stop-pickup',
      tripId: 'trip-1',
      sequence: 1,
      kind: TripStopKind.PICKUP,
      transportLegId: 'leg-1',
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
    {
      id: 'stop-dropoff',
      tripId: 'trip-1',
      sequence: 2,
      kind: TripStopKind.DROPOFF,
      transportLegId: 'leg-1',
      facilityId: FACILITY.id,
      address: null,
      latitude: null,
      longitude: null,
      plannedAt: '2026-09-15T08:45:00.000Z',
      actualAt: null,
      dwellDecision: null,
      dwellMinutes: null,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    },
  ] as never,
  occupancyWindow: { startsAt: '2026-09-15T08:00:00.000Z', endsAt: '2026-09-15T08:45:00.000Z' },
  emptyLegs: [],
  issues: [],
  routeGeometry: null,
  legsById: { [LEG.id]: LEG } as never,
  ...overrides,
});

const renderPage = (tripId = 'trip-1') =>
  render(
    <MemoryRouter initialEntries={[`/transport-planning/journeys/${tripId}`]}>
      <Routes>
        <Route
          path="/transport-planning/journeys/:tripId"
          element={
            <AdminContext dataProvider={testDataProvider()} i18nProvider={polyglotI18nProvider(messages, 'en')}>
              <TransportPlanningJourneyPage />
            </AdminContext>
          }
        />
      </Routes>
    </MemoryRouter>,
  );

describe('TransportPlanningJourneyPage', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  it('loads the journey and shows the vehicle, the crew requirement and the ordered stops', async () => {
    mockApiFetch.mockImplementation((path: string) => (path === '/trips/trip-1' ? Promise.resolve(journey()) : Promise.resolve([])));
    renderPage();

    expect(await screen.findByText('Journey 2')).toBeInTheDocument();
    expect(screen.getByText('101 · AA-11-BB')).toBeInTheDocument();
    // Once per stop row — the pickup and the dropoff both name the leg's patient.
    expect(screen.getAllByText('Maria Costa')).toHaveLength(2);
    expect(screen.getAllByText('30.0 km')).toHaveLength(2);
  });

  it('degrades the patient name the same way the board does, without hiding the stop', async () => {
    const legWithoutName = { ...LEG, patientName: undefined };
    mockApiFetch.mockImplementation((path: string) =>
      path === '/trips/trip-1'
        ? Promise.resolve(journey({ legsById: { [LEG.id]: legWithoutName } as never }))
        : Promise.resolve([]),
    );
    renderPage();

    expect(await screen.findAllByText('(identity hidden)')).toHaveLength(2);
  });

  it('surfaces a load failure rather than a blank page', async () => {
    mockApiFetch.mockImplementation(() => Promise.reject(new ApiError('Not found', 404)));
    renderPage();

    expect(await screen.findByText('Not found')).toBeInTheDocument();
  });

  it('opens the crew dialog from the journey page', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockImplementation((path: string, options?: { method?: string }) => {
      if (path === '/trips/trip-1') return Promise.resolve(journey());
      if (path.startsWith('/trips/crew-candidates')) return Promise.resolve([]);
      if (options?.method) return Promise.resolve({});
      return Promise.resolve([]);
    });
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Edit crew' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('offers the print action once the journey has loaded', async () => {
    mockApiFetch.mockImplementation((path: string) => (path === '/trips/trip-1' ? Promise.resolve(journey()) : Promise.resolve([])));
    renderPage();

    expect(await screen.findByRole('button', { name: 'Print' })).toBeInTheDocument();
  });

  it('shows this journey’s own map, with no other journeys, beside the stops', async () => {
    mockApiFetch.mockImplementation((path: string) => (path === '/trips/trip-1' ? Promise.resolve(journey()) : Promise.resolve([])));
    renderPage();

    // The map degrades to a plain notice in jsdom (no real basemap probe
    // succeeds here) — this asserts the section is wired in at all, not
    // MapLibre's own rendering, which `MapPanel.test.tsx` already covers.
    expect(await screen.findByText('Route')).toBeInTheDocument();
    expect(await screen.findByText('The basemap is not available on this install.')).toBeInTheDocument();
  });
});
