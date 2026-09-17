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
  TransportPlanningLane,
  TransportPlanningLeg,
  TripStatus,
  TripStopKind,
  VehicleDayJourneys,
  VehicleType,
  distanceInKm,
} from '@redinfo/shared';
import { messages } from '../i18n/i18nProvider';
import { encodePolyline } from '../test/polyline';
import { TransportPlanningVehiclePage } from './TransportPlanningVehiclePage';
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

const VEHICLE = {
  id: 'veh-1',
  licensePlate: 'AA-11-BB',
  numeroCauda: '101',
  vehicleType: VehicleType.TRANSPORT,
  seatedCapacity: 3,
  wheelchairPositions: 1,
  stretcherPositions: 0,
};

function leg(overrides: Partial<TransportPlanningLeg> = {}): TransportPlanningLeg {
  return ({
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
    destinationFacilityId: 'fac-1',
    destinationFacility: { id: 'fac-1', name: 'Hospital de São João' },
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
    patientMobility: PatientMobility.AMBULATORY,
    patientName: 'Maria Costa',
    travelMinutes: 45,
    travelEstimated: false,
    travelDistanceMeters: 30_000,
    suggested: { pickupAt: null, dropoffAt: null },
    door: { origin: null, destination: null },
    ...overrides,
  } as never) as TransportPlanningLeg;
}

function stopsFor(legId: string): TransportPlanningLane['stops'] {
  return [
    {
      id: `${legId}-pickup`,
      tripId: 'trip-1',
      sequence: 1,
      kind: TripStopKind.PICKUP,
      transportLegId: legId,
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
      id: `${legId}-dropoff`,
      tripId: 'trip-1',
      sequence: 2,
      kind: TripStopKind.DROPOFF,
      transportLegId: legId,
      facilityId: 'fac-1',
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
  ] as never;
}

function lane(overrides: Partial<TransportPlanningLane> = {}): TransportPlanningLane {
  return {
    trip: {
      id: 'trip-1',
      date: '2026-09-15',
      vehicleId: 'veh-1',
      status: TripStatus.PLANNED,
      notes: null,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    },
    journeyNumber: 1,
    vehicle: VEHICLE,
    crewMembers: [],
    crewRequirement: STANDARD_TRIP_CREW_REQUIREMENT,
    stops: stopsFor('leg-1'),
    occupancyWindow: { startsAt: '2026-09-15T08:00:00.000Z', endsAt: '2026-09-15T08:45:00.000Z' },
    emptyLegs: [],
    issues: [],
    routeGeometry: null,
    ...overrides,
  };
}

function vehicleDay(overrides: Partial<VehicleDayJourneys> = {}): VehicleDayJourneys {
  return {
    date: '2026-09-15',
    vehicle: VEHICLE,
    lanes: [lane()],
    legsById: { 'leg-1': leg() },
    ...overrides,
  };
}

const renderPage = (vehicleId = 'veh-1', search = '?date=2026-09-15') =>
  render(
    <MemoryRouter initialEntries={[`/transport-planning/vehicle/${vehicleId}${search}`]}>
      <Routes>
        <Route
          path="/transport-planning/vehicle/:vehicleId"
          element={
            <AdminContext dataProvider={testDataProvider()} i18nProvider={polyglotI18nProvider(messages, 'en')}>
              <TransportPlanningVehiclePage />
            </AdminContext>
          }
        />
        <Route path="/transport-planning/journeys/:tripId" element={<div>Journey detail stub</div>} />
      </Routes>
    </MemoryRouter>,
  );

describe('TransportPlanningVehiclePage', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  it('loads the vehicle’s day and lists each journey in order', async () => {
    mockApiFetch.mockImplementation((path: string) =>
      path === '/trips/vehicle/veh-1?date=2026-09-15'
        ? Promise.resolve(
            vehicleDay({
              lanes: [
                lane({
                  journeyNumber: 1,
                  trip: { ...lane().trip, id: 'trip-1' },
                  stops: stopsFor('leg-1'),
                  routeGeometry: encodePolyline([BARCELOS, PORTO]),
                }),
                lane({
                  journeyNumber: 2,
                  trip: { ...lane().trip, id: 'trip-2' },
                  stops: stopsFor('leg-2'),
                  occupancyWindow: { startsAt: '2026-09-15T14:00:00.000Z', endsAt: '2026-09-15T14:30:00.000Z' },
                  routeGeometry: encodePolyline([PORTO, BARCELOS]),
                }),
              ],
              legsById: { 'leg-1': leg({ id: 'leg-1' }), 'leg-2': leg({ id: 'leg-2', patientId: 'pat-2', travelDistanceMeters: 10_000 }) },
            }),
          )
        : Promise.resolve([]),
    );
    renderPage();

    expect(await screen.findByText('Journey 1 — Hospital de São João')).toBeInTheDocument();
    expect(screen.getByText('Journey 2 — Hospital de São João')).toBeInTheDocument();
    expect(screen.getByText('2 journeys')).toBeInTheDocument();
    // Each journey's own driven route, summed — not each leg's stand-alone
    // pickup→dropoff distance (see `journeySummary`'s own doc comment).
    const expectedKm = Math.round(2 * distanceInKm(BARCELOS, PORTO));
    expect(screen.getByText(`${expectedKm} km`)).toBeInTheDocument();
    expect(screen.getByText('1h 15')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('shows a "no journeys" message for a vehicle with nothing planned that date', async () => {
    mockApiFetch.mockImplementation((path: string) =>
      path === '/trips/vehicle/veh-1?date=2026-09-15' ? Promise.resolve(vehicleDay({ lanes: [], legsById: {} })) : Promise.resolve([]),
    );
    renderPage();

    expect(await screen.findByText('No journeys on this date.')).toBeInTheDocument();
  });

  it('surfaces a load failure rather than a blank page', async () => {
    mockApiFetch.mockImplementation(() => Promise.reject(new ApiError('Vehicle not found', 404)));
    renderPage();

    expect(await screen.findByText('Vehicle not found')).toBeInTheDocument();
  });

  it('gives each journey its own map, collapsible independently of the others', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockImplementation((path: string) =>
      path === '/trips/vehicle/veh-1?date=2026-09-15'
        ? Promise.resolve(
            vehicleDay({
              lanes: [
                lane({
                  journeyNumber: 1,
                  trip: { ...lane().trip, id: 'trip-1' },
                  stops: stopsFor('leg-1'),
                  routeGeometry: encodePolyline([BARCELOS, PORTO]),
                }),
                lane({
                  journeyNumber: 2,
                  trip: { ...lane().trip, id: 'trip-2' },
                  stops: stopsFor('leg-2'),
                  routeGeometry: encodePolyline([PORTO, BARCELOS]),
                }),
              ],
              legsById: { 'leg-1': leg({ id: 'leg-1' }), 'leg-2': leg({ id: 'leg-2', patientId: 'pat-2' }) },
            }),
          )
        : Promise.resolve([]),
    );
    renderPage();

    // One map per journey, both expanded by default.
    expect(await screen.findAllByText('Route')).toHaveLength(2);

    // Collapsing journey 1's map leaves journey 2's own map alone.
    const collapseButtons = screen.getAllByRole('button', { name: 'Collapse the map' });
    await user.click(collapseButtons[0]);
    expect(screen.getAllByText('Route')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Expand the map' })).toBeInTheDocument();
  });

  it('opens the corresponding journey page from the journey list', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockImplementation((path: string) =>
      path === '/trips/vehicle/veh-1?date=2026-09-15' ? Promise.resolve(vehicleDay()) : Promise.resolve([]),
    );
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Open journey' }));
    expect(await screen.findByText('Journey detail stub')).toBeInTheDocument();
  });
});
