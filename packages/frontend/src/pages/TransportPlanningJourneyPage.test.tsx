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
  distanceInKm,
} from '@redinfo/shared';
import { messages } from '../i18n/i18nProvider';
import { encodePolyline } from '../test/polyline';
import { TransportPlanningJourneyPage } from './TransportPlanningJourneyPage';
import { apiFetch, ApiError } from '../api';

// Campo, Barcelos → Hospital de São João, Porto — real, well-separated
// points so the aggregated-distance assertion below is meaningfully non-zero.
const BARCELOS = { latitude: 41.5388, longitude: -8.6151 };
const PORTO = { latitude: 41.1579, longitude: -8.6291 };

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
      latitude: BARCELOS.latitude,
      longitude: BARCELOS.longitude,
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
      latitude: PORTO.latitude,
      longitude: PORTO.longitude,
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
  routeGeometry: encodePolyline([BARCELOS, PORTO]),
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

    expect(await screen.findByText('101 · Journey 2 — Hospital de São João')).toBeInTheDocument();
    expect(screen.getByText('AA-11-BB')).toBeInTheDocument();
    // Once per stop row — the pickup and the dropoff both name the leg's patient.
    expect(screen.getAllByText('Maria Costa')).toHaveLength(2);
    // The pickup is the journey's first row, so it has no predecessor to
    // measure a distance from; the dropoff shows the straight-line distance
    // from the pickup that came right before it in the timeline.
    expect(screen.getByText(`${distanceInKm(BARCELOS, PORTO).toFixed(1)} km`)).toBeInTheDocument();
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

  it('shows the aggregated summary blocks and a crew-complete badge for a one-journey day', async () => {
    mockApiFetch.mockImplementation((path: string) => (path === '/trips/trip-1' ? Promise.resolve(journey()) : Promise.resolve([])));
    renderPage();

    await screen.findByText('101 · Journey 2 — Hospital de São João');
    // The journey's own driven route (`routeGeometry`), not the leg's
    // stand-alone pickup→dropoff distance — see `journeySummary`'s doc comment.
    const expectedKm = Math.round(distanceInKm(BARCELOS, PORTO));
    expect(screen.getByText(`${expectedKm} km`)).toBeInTheDocument();
    expect(screen.getByText('45 min')).toBeInTheDocument();
    // "Distance" is also the stop table's own column header — the summary
    // block reuses the same word, so this only asserts it appears at all.
    expect(screen.getAllByText('Distance').length).toBeGreaterThan(0);
    expect(screen.getByText('Vehicle occupied')).toBeInTheDocument();
    expect(screen.getByText('Patient')).toBeInTheDocument();
    expect(screen.getByText('Crew complete')).toBeInTheDocument();
    expect(screen.queryByText('Round trip')).not.toBeInTheDocument();
  });

  it('collapses and expands the map column', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockImplementation((path: string) => (path === '/trips/trip-1' ? Promise.resolve(journey()) : Promise.resolve([])));
    renderPage();

    await screen.findByText('Route');
    await user.click(screen.getByRole('button', { name: 'Collapse the map' }));
    expect(screen.queryByText('Route')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Expand the map' }));
    expect(await screen.findByText('Route')).toBeInTheDocument();
  });
});
