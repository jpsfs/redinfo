import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { AdminContext, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import {
  CertificationType,
  LegDirection,
  LegStatus,
  PatientMobility,
  STANDARD_TRIP_CREW_REQUIREMENT,
  STRETCHER_TRIP_CREW_REQUIREMENT,
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

const FACILITY = { id: 'fac-1', name: 'Hospital de São João' };

/**
 * A leg as the rail actually receives one: nothing planned yet, so the times
 * on the card are the board's own suggestions. The pickup and the home
 * arrival are precisely what the crew works out by experience today, which is
 * why they are the fields these tests care about.
 */
const LEG_UNASSIGNED = {
  id: 'leg-unassigned',
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
  patientId: 'pat-1',
  patientMobility: PatientMobility.WHEELCHAIR,
  patientName: 'Maria Costa',
  travelMinutes: 45,
  travelEstimated: false,
  suggested: { pickupAt: '2026-09-15T07:57:30.000Z', dropoffAt: '2026-09-15T08:42:30.000Z' },
};

const lane = (
  id: string,
  vehicle: { id: string; numeroCauda: string; licensePlate: string },
  journeyNumber = 1,
) => ({
  trip: {
    id,
    date: '2026-09-15',
    vehicleId: vehicle.id,
    status: TripStatus.PLANNED,
    notes: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  journeyNumber,
  vehicle: {
    ...vehicle,
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
});

const VEHICLE_101 = { id: 'veh-1', licensePlate: 'AA-11-BB', numeroCauda: '101' };

/** A leg already placed on a lane, with the `PICKUP`/`DROPOFF` pair the board
 * draws a passenger row from. */
const assignedLeg = (
  id: string,
  patientName: string,
  times: { pickup: string; dropoff: string },
  overrides: Record<string, unknown> = {},
) => ({
  ...LEG_UNASSIGNED,
  id,
  patientId: `pat-${id}`,
  patientName,
  plannedPickupAt: times.pickup,
  plannedDropoffAt: times.dropoff,
  ...overrides,
});

const stopPair = (legId: string, times: { pickup: string; dropoff: string }, sequence: number) => [
  {
    id: `${legId}-pickup`,
    tripId: 'trip-1',
    sequence,
    kind: TripStopKind.PICKUP,
    transportLegId: legId,
    facilityId: null,
    address: null,
    latitude: null,
    longitude: null,
    plannedAt: times.pickup,
    actualAt: null,
    dwellDecision: null,
    dwellMinutes: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
  {
    id: `${legId}-dropoff`,
    tripId: 'trip-1',
    sequence: sequence + 1,
    kind: TripStopKind.DROPOFF,
    transportLegId: legId,
    facilityId: FACILITY.id,
    address: null,
    latitude: null,
    longitude: null,
    plannedAt: times.dropoff,
    actualAt: null,
    dwellDecision: null,
    dwellMinutes: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  },
];

const board = (overrides: Partial<TransportPlanningBoard> = {}): TransportPlanningBoard => ({
  date: '2026-09-15',
  lanes: [lane('trip-1', VEHICLE_101) as never],
  legsById: { [LEG_UNASSIGNED.id]: LEG_UNASSIGNED as never },
  unassignedLegIds: [LEG_UNASSIGNED.id],
  ...overrides,
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <AdminContext dataProvider={testDataProvider()} i18nProvider={polyglotI18nProvider(messages, 'en')}>
        <TransportPlanningPage />
      </AdminContext>
    </MemoryRouter>,
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

  it('shows the destination on the unassigned card, since it decides which legs can share a journey', async () => {
    mockApiFetch.mockImplementation((path: string) =>
      Promise.resolve(path.startsWith('/trips/board') ? board() : []),
    );
    renderPage();

    expect(await screen.findByText('Hospital de São João')).toBeInTheDocument();
  });

  it('shows H.I., H.F. and the collection time, marking the collection as a suggestion until it is planned', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockImplementation((path: string) =>
      Promise.resolve(path.startsWith('/trips/board') ? board() : []),
    );
    renderPage();
    // This level of per-leg detail is the flat "por pessoa" card's job
    // (#247 stage 2) — the grouped default shows only name and mobility.
    await user.click(await screen.findByRole('button', { name: 'Per person' }));

    // The two times the referral states, under the delegation's own headings.
    expect(await screen.findByText('H.I.')).toBeInTheDocument();
    expect(screen.getByText('H.F.')).toBeInTheDocument();
    // And the one the crew infers today — never presented as a commitment.
    expect(screen.getByText('Collect')).toBeInTheDocument();
    expect(screen.getByText(/\(suggested\)/)).toBeInTheDocument();
  });

  it('shows the travel and treatment durations, the two different questions a planner asks', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockImplementation((path: string) =>
      Promise.resolve(path.startsWith('/trips/board') ? board() : []),
    );
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Per person' }));

    expect(await screen.findByText('Travel 45 min')).toBeInTheDocument();
    expect(screen.getByText('Treatment 1h 30')).toBeInTheDocument();
  });

  it('draws an hour axis, so a block position can be read as a time at all', async () => {
    mockApiFetch.mockImplementation((path: string) =>
      Promise.resolve(path.startsWith('/trips/board') ? board() : []),
    );
    renderPage();

    await screen.findByText('Maria Costa');
    // Asserted as a run of whole-hour labels rather than specific hours: the
    // span now fits the day's own times, which are local to whatever zone the
    // suite happens to run in.
    const hourLabels = screen.getAllByText(/^([01]\d|2[0-4]):00$/);
    expect(hourLabels.length).toBeGreaterThanOrEqual(6);
  });

  it('numbers a vehicle’s trips as its journeys, the sections the printed sheet separates', async () => {
    mockApiFetch.mockImplementation((path: string) =>
      Promise.resolve(
        path.startsWith('/trips/board')
          ? board({ lanes: [lane('trip-1', VEHICLE_101, 1), lane('trip-2', VEHICLE_101, 2)] as never })
          : [],
      ),
    );
    renderPage();

    // Two journey rows, each numbered. The ordinal is a badge beside the
    // word, so the numbering is asserted through the per-journey crew
    // control, which names the journey it belongs to.
    expect(await screen.findAllByText('Journey')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Crew for journey 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crew for journey 2' })).toBeInTheDocument();
    // One vehicle header for the two journeys, not one per trip.
    expect(screen.getAllByText('101')).toHaveLength(1);
  });

  it('adds another journey to a vehicle already on the board, without a second vehicle row', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockImplementation((path: string, options?: { method?: string }) => {
      if (path.startsWith('/trips/board')) return Promise.resolve(board());
      if (path === '/trips' && options?.method === 'POST') return Promise.resolve({});
      return Promise.resolve([]);
    });
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'New journey' }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/trips',
        expect.objectContaining({ method: 'POST', body: expect.objectContaining({ vehicleId: 'veh-1' }) }),
      ),
    );
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

  // ── Reading a journey at a glance (#235) ──────────────────────────────────
  //
  // A journey collects the furthest patient first and picks the others up
  // along the way, so several people are in the vehicle at once. Each gets a
  // row of their own; before this they were all drawn at the same `top` and
  // covered each other up.

  describe('journey legibility', () => {
    const MORNING = { pickup: '2026-09-15T08:00:00.000Z', dropoff: '2026-09-15T09:00:00.000Z' };
    const LATER = { pickup: '2026-09-15T08:30:00.000Z', dropoff: '2026-09-15T09:00:00.000Z' };

    const sharedJourney = () => {
      const first = assignedLeg('leg-a', 'Maria Costa', MORNING);
      const second = assignedLeg('leg-b', 'João Silva', LATER);
      return board({
        lanes: [
          {
            ...lane('trip-1', VEHICLE_101),
            stops: [...stopPair('leg-a', MORNING, 1), ...stopPair('leg-b', LATER, 3)],
          },
        ] as never,
        legsById: { 'leg-a': first, 'leg-b': second } as never,
        unassignedLegIds: [],
      });
    };

    it('gives every passenger sharing a journey their own row, at their own time', async () => {
      mockApiFetch.mockImplementation((path: string) =>
        Promise.resolve(path.startsWith('/trips/board') ? sharedJourney() : []),
      );
      renderPage();

      const maria = await screen.findByRole('button', { name: /Maria Costa/ });
      const joao = screen.getByRole('button', { name: /João Silva/ });
      // Rows of their own, not stacked on each other — the whole point. In
      // pickup order, so the row reads as the order the crew collects them in.
      expect(maria.getAttribute('data-passenger-row')).toBe('0');
      expect(joao.getAttribute('data-passenger-row')).toBe('1');
      // Each bar names its passenger and their destination, whether or not the
      // bar is wide enough to print it inside.
      expect(maria).toHaveAccessibleName('Maria Costa ▸ Hospital de São João');
    });

    it('keeps a short bar readable by printing the name beside it instead of inside', async () => {
      mockApiFetch.mockImplementation((path: string) =>
        Promise.resolve(path.startsWith('/trips/board') ? sharedJourney() : []),
      );
      renderPage();

      // A real leg is a few dozen pixels wide on a whole-day axis, which is
      // how the first cut of this rendered a patient as the character "0".
      const maria = await screen.findByRole('button', { name: /Maria Costa/ });
      expect(maria).toHaveTextContent('');
      // The name is still on the track, just outside the bar.
      expect(screen.getAllByText('Maria Costa').length).toBeGreaterThan(0);
    });

    it('names the destination facility on the journey itself, not only in a tooltip', async () => {
      mockApiFetch.mockImplementation((path: string) =>
        Promise.resolve(path.startsWith('/trips/board') ? sharedJourney() : []),
      );
      renderPage();

      // Once per journey lane — the rail is empty in this fixture.
      expect(await screen.findAllByText('Hospital de São João')).toHaveLength(1);
    });

    it("shows the journey's crew requirement, and a stretcher journey's stricter one", async () => {
      mockApiFetch.mockImplementation((path: string) =>
        Promise.resolve(
          path.startsWith('/trips/board')
            ? board({
                lanes: [
                  { ...lane('trip-1', VEHICLE_101, 1), crewRequirement: STANDARD_TRIP_CREW_REQUIREMENT },
                  { ...lane('trip-2', VEHICLE_101, 2), crewRequirement: STRETCHER_TRIP_CREW_REQUIREMENT },
                ] as never,
              })
            : [],
        ),
      );
      renderPage();

      expect(await screen.findByText('1× SBV')).toBeInTheDocument();
      expect(screen.getByText('2× TAT')).toBeInTheDocument();
    });
  });

  describe('crew assignment', () => {
    const CANDIDATES = [
      {
        userId: 'u1',
        firstName: 'Ana',
        lastName: 'Dias',
        certifications: [CertificationType.TAS, CertificationType.TAT, CertificationType.SBV],
        absent: false,
        crewingTripIds: [],
        onRoster: true,
      },
      {
        userId: 'u2',
        firstName: 'Bruno',
        lastName: 'Eiras',
        certifications: [],
        absent: true,
        crewingTripIds: [],
        onRoster: false,
      },
    ];

    const crewedLane = () => ({
      ...lane('trip-1', VEHICLE_101),
      crewMembers: [
        {
          id: 'cm1',
          tripId: 'trip-1',
          userId: 'u9',
          role: CertificationType.DRIVER,
          overrideReason: null,
          createdAt: '2026-09-01T00:00:00.000Z',
          firstName: 'Carla',
          lastName: 'Fonseca',
          certifications: [CertificationType.DRIVER],
        },
      ],
    });

    function mockBoard(laneValue: unknown) {
      mockApiFetch.mockImplementation((path: string, options?: { method?: string }) => {
        if (path.startsWith('/trips/board')) return Promise.resolve(board({ lanes: [laneValue] as never }));
        if (path.startsWith('/trips/crew-candidates')) return Promise.resolve(CANDIDATES);
        if (path === '/trips/trip-1/crew' && options?.method === 'POST') return Promise.resolve({});
        return Promise.resolve([]);
      });
    }

    it('shows the crew on the lane and opens the dialog from it', async () => {
      const user = userEvent.setup();
      mockBoard(crewedLane());
      renderPage();

      await user.click(await screen.findByRole('button', { name: 'Crew for journey 1' }));
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText('Carla Fonseca')).toBeInTheDocument();
    });

    it("adds a crew member to the whole vehicle's day by default", async () => {
      const user = userEvent.setup();
      mockBoard(crewedLane());
      renderPage();

      await user.click(await screen.findByRole('button', { name: 'Crew for journey 1' }));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByLabelText('Person'));
      await user.click(await screen.findByRole('option', { name: /Ana Dias/ }));
      await user.click(within(dialog).getByRole('button', { name: 'Add' }));

      await waitFor(() =>
        expect(mockApiFetch).toHaveBeenCalledWith(
          '/trips/trip-1/crew',
          expect.objectContaining({
            method: 'POST',
            // The strongest certification they actually hold is pre-selected,
            // and "all day" is the default the delegation actually works to.
            body: expect.objectContaining({
              userId: 'u1',
              role: CertificationType.TAS,
              applyToVehicleDay: true,
            }),
          }),
        ),
      );
    });

    it('lists an absent person but demands a reason before adding them', async () => {
      const user = userEvent.setup();
      mockBoard(crewedLane());
      renderPage();

      await user.click(await screen.findByRole('button', { name: 'Crew for journey 1' }));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByLabelText('Person'));
      await user.click(await screen.findByRole('option', { name: /Bruno Eiras/ }));

      const addButton = within(dialog).getByRole('button', { name: 'Add' });
      expect(addButton).toBeDisabled();
      await user.type(within(dialog).getByLabelText('Override reason'), 'Agreed to come in');
      expect(addButton).not.toBeDisabled();
    });
  });

  // ── Journey identity and focus mode (#247 stage 1) ──────────────────────

  describe('focus mode', () => {
    it('opens the inspector for the selected journey, and closes it on a second click', async () => {
      const user = userEvent.setup();
      mockApiFetch.mockImplementation((path: string) =>
        Promise.resolve(path.startsWith('/trips/board') ? board() : []),
      );
      renderPage();

      const selectButton = await screen.findByRole('button', { name: 'Select journey 1' });
      await user.click(selectButton);

      expect(await screen.findByText('Journey 1 · 101')).toBeInTheDocument();
      expect(selectButton).toHaveAttribute('aria-pressed', 'true');

      await user.click(selectButton);
      expect(screen.queryByText('Journey 1 · 101')).not.toBeInTheDocument();
    });

    it('groups the inspector’s stops into pickups and deliveries, so a patient’s name has room', async () => {
      const user = userEvent.setup();
      const MORNING = { pickup: '2026-09-15T08:00:00.000Z', dropoff: '2026-09-15T09:00:00.000Z' };
      const LATER = { pickup: '2026-09-15T08:30:00.000Z', dropoff: '2026-09-15T09:00:00.000Z' };
      const first = assignedLeg('leg-a', 'Maria Costa', MORNING);
      const second = assignedLeg('leg-b', 'João Silva', LATER);
      mockApiFetch.mockImplementation((path: string) =>
        Promise.resolve(
          path.startsWith('/trips/board')
            ? board({
                lanes: [
                  { ...lane('trip-1', VEHICLE_101), stops: [...stopPair('leg-a', MORNING, 1), ...stopPair('leg-b', LATER, 3)] },
                ] as never,
                legsById: { 'leg-a': first, 'leg-b': second } as never,
                unassignedLegIds: [],
              })
            : [],
        ),
      );
      renderPage();

      await user.click(await screen.findByRole('button', { name: 'Select journey 1' }));

      expect(await screen.findByText('Pickups')).toBeInTheDocument();
      expect(screen.getByText('Deliveries')).toBeInTheDocument();
    });
  });

  // ── Avisos (#new) — a counter beside the zoom controls, not a permanent
  // pane at the bottom of the page ──────────────────────────────────────────

  describe('avisos', () => {
    it('shows a warning count beside the zoom controls and opens the issues in a dialog', async () => {
      const user = userEvent.setup();
      mockApiFetch.mockImplementation((path: string) =>
        Promise.resolve(
          path.startsWith('/trips/board')
            ? board({
                lanes: [
                  {
                    ...lane('trip-1', VEHICLE_101),
                    issues: [{ level: 'WARNING', code: 'ARRIVAL_WINDOW', message: 'Atraso previsto' }],
                  },
                ] as never,
              })
            : [],
        ),
      );
      renderPage();

      const warningsButton = await screen.findByRole('button', { name: '1 warnings' });
      expect(screen.queryByText('Atraso previsto')).not.toBeInTheDocument();

      await user.click(warningsButton);
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText(/Atraso previsto/)).toBeInTheDocument();

      await user.click(within(dialog).getByRole('button', { name: 'Close' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });
  });

  // ── Collapsible unassigned rail (#new) ────────────────────────────────────

  describe('rail collapse', () => {
    it('collapses the unassigned rail out of the way and back again', async () => {
      const user = userEvent.setup();
      mockApiFetch.mockImplementation((path: string) =>
        Promise.resolve(path.startsWith('/trips/board') ? board() : []),
      );
      renderPage();

      await screen.findByText('Maria Costa');
      await user.click(screen.getByRole('button', { name: 'Collapse the panel' }));
      expect(screen.queryByText('Maria Costa')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Expand the panel' }));
      expect(await screen.findByText('Maria Costa')).toBeInTheDocument();
    });
  });

  // ── Grouped unplanned rail (#247 stage 2) ────────────────────────────────

  describe('unplanned rail grouping', () => {
    const LEG_SAME_GROUP = { ...LEG_UNASSIGNED, id: 'leg-2', patientId: 'pat-2', patientName: 'João Silva' };

    const groupedBoard = () =>
      board({
        legsById: { [LEG_UNASSIGNED.id]: LEG_UNASSIGNED, [LEG_SAME_GROUP.id]: LEG_SAME_GROUP } as never,
        unassignedLegIds: [LEG_UNASSIGNED.id, LEG_SAME_GROUP.id],
      });

    it('groups two people bound for the same facility within 15 minutes into one card', async () => {
      const user = userEvent.setup();
      mockApiFetch.mockImplementation((path: string) => Promise.resolve(path.startsWith('/trips/board') ? groupedBoard() : []));
      renderPage();

      expect(await screen.findByText('2 people')).toBeInTheDocument();
      // Both names listed inside the one card — the whole point of grouping
      // is that they stay visible, not that they disappear into a count.
      expect(screen.getByText('Maria Costa')).toBeInTheDocument();
      expect(screen.getByText('João Silva')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Per person' }));
      // Two flat cards now, each with its own "Assign" button — no group
      // action, and no group-size chip.
      expect(await screen.findAllByRole('button', { name: 'Assign' })).toHaveLength(2);
      expect(screen.queryByRole('button', { name: 'Assign group' })).not.toBeInTheDocument();
      expect(screen.queryByText('2 people')).not.toBeInTheDocument();
    });

    it('assigns every person in a group to the same journey with one dialog', async () => {
      const user = userEvent.setup();
      const assignedLegIds: string[] = [];
      mockApiFetch.mockImplementation((path: string, options?: { method?: string; body?: Record<string, unknown> }) => {
        if (path.startsWith('/trips/board')) return Promise.resolve(groupedBoard());
        if (path.startsWith('/vehicle-occupancy')) return Promise.resolve([]);
        if (path === '/trips/trip-1/legs' && options?.method === 'POST') {
          assignedLegIds.push(options.body?.transportLegId as string);
          return Promise.resolve({});
        }
        return Promise.resolve([]);
      });
      renderPage();

      await user.click(await screen.findByRole('button', { name: 'Assign group' }));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByLabelText('Vehicle'));
      await user.click(await screen.findByRole('option', { name: /101/ }));
      await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));

      await waitFor(() => expect(assignedLegIds).toEqual(['leg-unassigned', 'leg-2']));
    });
  });
});
