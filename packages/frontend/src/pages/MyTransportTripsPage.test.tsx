import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AdminContext, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import { MemoryRouter } from 'react-router-dom';
import { LegDirection, MyTransportTripsResponse, PatientMobility, TripStatus, TripStopKind, VehicleType } from '@redinfo/shared';
import { messages } from '../i18n/i18nProvider';
import { MyTransportTripsPage } from './MyTransportTripsPage';
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

const renderPage = () =>
  render(
    <MemoryRouter>
      <AdminContext dataProvider={testDataProvider()} i18nProvider={i18nProvider}>
        <MyTransportTripsPage />
      </AdminContext>
    </MemoryRouter>,
  );

function buildResponse(overrides: Partial<MyTransportTripsResponse> = {}): MyTransportTripsResponse {
  return {
    date: '2026-09-16',
    trips: [
      {
        trip: {
          id: 'trip-1',
          date: '2026-09-16',
          vehicleId: 'v1',
          status: TripStatus.PLANNED,
          notes: null,
          createdAt: '2026-09-15T00:00:00.000Z',
          updatedAt: '2026-09-15T00:00:00.000Z',
        },
        vehicle: { id: 'v1', licensePlate: 'AA-00-AA', numeroCauda: 'CV-01', vehicleType: VehicleType.TRANSPORT },
        stops: [
          {
            id: 'stop-pickup',
            tripId: 'trip-1',
            sequence: 1,
            kind: TripStopKind.PICKUP,
            transportLegId: 'leg-1',
            facilityId: null,
            address: 'Rua de Teste, 1',
            latitude: null,
            longitude: null,
            plannedAt: '2026-09-16T08:00:00.000Z',
            actualAt: null,
            dwellDecision: null,
            dwellMinutes: null,
            createdAt: '2026-09-15T00:00:00.000Z',
            updatedAt: '2026-09-15T00:00:00.000Z',
            facilityName: null,
            legDirection: LegDirection.OUTBOUND,
            patientId: 'patient-1',
            patientName: 'Maria Silva',
            patientMobility: PatientMobility.WHEELCHAIR,
            appointmentAt: '2026-09-16T09:00:00.000Z',
            treatmentEndAt: '2026-09-16T09:30:00.000Z',
          },
          {
            id: 'stop-dropoff',
            tripId: 'trip-1',
            sequence: 2,
            kind: TripStopKind.DROPOFF,
            transportLegId: 'leg-1',
            facilityId: 'facility-1',
            address: null,
            latitude: null,
            longitude: null,
            plannedAt: '2026-09-16T08:30:00.000Z',
            actualAt: null,
            dwellDecision: null,
            dwellMinutes: null,
            createdAt: '2026-09-15T00:00:00.000Z',
            updatedAt: '2026-09-15T00:00:00.000Z',
            facilityName: 'Hospital de Braga',
            legDirection: LegDirection.OUTBOUND,
            patientId: 'patient-1',
            patientName: 'Maria Silva',
            patientMobility: PatientMobility.WHEELCHAIR,
            appointmentAt: '2026-09-16T09:00:00.000Z',
            treatmentEndAt: '2026-09-16T09:30:00.000Z',
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe('MyTransportTripsPage', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValue(buildResponse());
  });

  it("reads the signed-in crew member's own trips for today", async () => {
    const today = new Date().toISOString().slice(0, 10);
    renderPage();

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith(`/trips/me?date=${today}`));
  });

  it('shows the vehicle, the patient, the facility and the treatment window for a stop', async () => {
    renderPage();

    expect(await screen.findByText('Vehicle AA-00-AA')).toBeInTheDocument();
    expect(screen.getAllByText('Maria Silva').length).toBeGreaterThan(0);
    expect(screen.getByText('Hospital de Braga')).toBeInTheDocument();
    expect(screen.getAllByText('Treatment: 09:00 – 09:30').length).toBeGreaterThan(0);
  });

  it('reads a return leg\'s pickup stop as awaiting the ready call until actualAt is set', async () => {
    const response = buildResponse();
    response.trips[0].stops = [
      { ...response.trips[0].stops[0], kind: TripStopKind.PICKUP, legDirection: LegDirection.RETURN, actualAt: null },
    ];
    mockApiFetch.mockResolvedValue(response);
    renderPage();

    expect(await screen.findByText('Awaiting ready call')).toBeInTheDocument();
  });

  it('reads a return leg\'s pickup stop as ready once actualAt is set', async () => {
    const response = buildResponse();
    response.trips[0].stops = [
      {
        ...response.trips[0].stops[0],
        kind: TripStopKind.PICKUP,
        legDirection: LegDirection.RETURN,
        actualAt: '2026-09-16T11:15:00.000Z',
      },
    ];
    mockApiFetch.mockResolvedValue(response);
    renderPage();

    expect(await screen.findByText('Ready at 11:15')).toBeInTheDocument();
  });

  it('flags a WAIT stop as somewhere the crew waits', async () => {
    const response = buildResponse();
    response.trips[0].stops = [
      {
        ...response.trips[0].stops[1],
        id: 'stop-wait',
        kind: TripStopKind.WAIT,
        transportLegId: null,
        legDirection: null,
        patientId: null,
        patientName: null,
        patientMobility: null,
        appointmentAt: null,
        treatmentEndAt: null,
      },
    ];
    mockApiFetch.mockResolvedValue(response);
    renderPage();

    expect(await screen.findByText('Crew waits here')).toBeInTheDocument();
  });

  it('says so plainly when there are no trips that day', async () => {
    mockApiFetch.mockResolvedValue({ date: '2026-09-16', trips: [] });
    renderPage();

    expect(await screen.findByText(/No transport trips planned for you this day/)).toBeInTheDocument();
  });

  it('reports a failure to load', async () => {
    mockApiFetch.mockRejectedValue(new Error('boom'));
    renderPage();

    expect(await screen.findByText('Could not load your trips.')).toBeInTheDocument();
  });
});
