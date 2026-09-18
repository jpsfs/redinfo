import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { AdminContext, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import { TransportPlanningLane, TransportPlanningLeg, TripStopKind } from '@redinfo/shared';
import { messages } from '../../../i18n/i18nProvider';
import { MapPanel } from './MapPanel';
import { probeTilesAvailable } from './tilesAvailability';

vi.mock('./tilesAvailability', () => ({
  TILES_URL: '/tiles/portugal.pmtiles',
  probeTilesAvailable: vi.fn(),
}));

// A minimal fake `maplibregl.Map`/`Marker` — this suite is about MapPanel's
// own wiring (does it add the right sources/layers, does a click select the
// right trip), never about MapLibre's own rendering, which needs a real
// WebGL context jsdom doesn't have. Defined inside `vi.hoisted` since
// `vi.mock`'s factory below is itself hoisted above any top-level
// `const`/`class` in this file.
const { MockMap, MockMarker, state } = vi.hoisted(() => {
  class MockMap {
    private handlers: Record<string, Array<(...args: never[]) => void>> = {};
    sources: Record<string, { setData: ReturnType<typeof vi.fn> }> = {};
    addControl = vi.fn();
    addSource = vi.fn((id: string) => {
      this.sources[id] = { setData: vi.fn() };
    });
    getSource = vi.fn((id: string) => this.sources[id]);
    addLayer = vi.fn();
    getLayer = vi.fn(() => true);
    setPaintProperty = vi.fn();
    getCanvas = vi.fn(() => ({ style: {} }));
    project = vi.fn(() => ({ x: 200, y: 150 }));
    getCenter = vi.fn(() => ({ lng: -8.42, lat: 41.55 }));
    fitBounds = vi.fn();
    isStyleLoaded = vi.fn(() => true);
    remove = vi.fn();

    on = vi.fn((event: string, a: unknown, b?: unknown) => {
      const key = typeof b === 'function' ? `${event}:${String(a)}` : event;
      const handler = (typeof b === 'function' ? b : a) as (...args: never[]) => void;
      (this.handlers[key] ??= []).push(handler);
    });

    once = vi.fn((event: string, handler: (...args: never[]) => void) => {
      (this.handlers[event] ??= []).push(handler);
    });

    fire(key: string, ...args: unknown[]) {
      (this.handlers[key] ?? []).forEach((handler) => handler(...(args as never[])));
    }
  }

  class MockMarker {
    element: HTMLElement;
    constructor(opts: { element: HTMLElement }) {
      this.element = opts.element;
    }
    setLngLat = vi.fn(() => this);
    // The real `Marker.addTo` inserts its element into the map's own DOM
    // container — mocked here as appending to `document.body`, so a
    // marker's own title/text is something RTL's queries can actually find.
    addTo = vi.fn(() => {
      document.body.appendChild(this.element);
      return this;
    });
    remove = vi.fn(() => this.element.remove());
    getElement = vi.fn(() => this.element);
  }

  return { MockMap, MockMarker, state: { lastMap: null as InstanceType<typeof MockMap> | null } };
});

vi.mock('maplibre-gl', () => ({
  // A subclass (rather than `vi.fn().mockImplementation(() => new MockMap())`)
  // so `new MapLibreMap(options)` is guaranteed a real `MockMap` instance —
  // constructor-return-object semantics via a plain mock function proved
  // unreliable through Vitest's own function-mock wrapper.
  MapLibreMap: class extends MockMap {
    constructor(_options: unknown) {
      super();
      state.lastMap = this;
    }
  },
  Marker: MockMarker,
  NavigationControl: vi.fn(),
  addProtocol: vi.fn(),
  removeProtocol: vi.fn(),
}));

vi.mock('pmtiles', () => ({
  Protocol: vi.fn().mockImplementation(() => ({ tile: vi.fn() })),
}));

const mockProbe = probeTilesAvailable as unknown as Mock;

function lane(overrides: Partial<TransportPlanningLane> = {}): TransportPlanningLane {
  return {
    trip: { id: 'trip-1', date: '2026-09-16', vehicleId: 'v1', status: 'PLANNED', notes: null, createdAt: '', updatedAt: '' } as never,
    journeyNumber: 1,
    vehicle: { numeroCauda: '101' } as never,
    crewMembers: [],
    crewRequirement: {} as never,
    stops: [],
    occupancyWindow: null,
    emptyLegs: [],
    issues: [],
    routeGeometry: null,
    ...overrides,
  };
}

function stop(overrides: Record<string, unknown> = {}) {
  return {
    id: 's1',
    tripId: 'trip-1',
    sequence: 1,
    kind: TripStopKind.PICKUP,
    transportLegId: 'leg-1',
    facilityId: null,
    address: null,
    latitude: null,
    longitude: null,
    plannedAt: '2026-09-16T08:00:00.000Z',
    actualAt: null,
    dwellDecision: null,
    dwellMinutes: null,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

function leg(overrides: Partial<TransportPlanningLeg> = {}): TransportPlanningLeg {
  return {
    id: 'leg-1',
    patientId: 'pat-1',
    patientMobility: 'AMBULATORY',
    travelMinutes: null,
    travelEstimated: false,
    travelDistanceMeters: null,
    suggested: { pickupAt: null, dropoffAt: null },
    door: { origin: null, destination: null },
    ...overrides,
  } as never;
}

const renderPanel = (props: Partial<React.ComponentProps<typeof MapPanel>> = {}) =>
  render(
    <AdminContext dataProvider={testDataProvider()} i18nProvider={polyglotI18nProvider(messages, 'en')}>
      <MapPanel
        board={{ lanes: [], legsById: {}, unassignedLegIds: [] }}
        selectedTripId={null}
        onSelectTrip={vi.fn()}
        {...props}
      />
    </AdminContext>,
  );

describe('MapPanel', () => {
  beforeEach(() => {
    mockProbe.mockReset();
    state.lastMap = null;
  });

  it('shows a loading state while the tiles probe is in flight', () => {
    mockProbe.mockReturnValue(new Promise(() => {})); // never resolves
    renderPanel();
    expect(screen.getByText('Loading the map…')).toBeInTheDocument();
  });

  it('degrades to a plain notice, never a broken map, when the basemap file is not there', async () => {
    mockProbe.mockResolvedValue(false);
    renderPanel();
    expect(await screen.findByText('The basemap is not available on this install.')).toBeInTheDocument();
    expect(screen.getByText(/prepare-basemap\.sh/)).toBeInTheDocument();
  });

  it('mounts the map and draws a route layer once tiles are available', async () => {
    mockProbe.mockResolvedValue(true);
    renderPanel({
      board: {
        lanes: [lane({ routeGeometry: '_p~iF~ps|U_ulLnnqC_mqNvxq`@' })],
        legsById: {},
        unassignedLegIds: [],
      },
    });

    await waitFor(() => expect(state.lastMap).not.toBeNull());
    act(() => state.lastMap!.fire('load'));

    expect(state.lastMap!.addSource).toHaveBeenCalledWith('routes', expect.objectContaining({ type: 'geojson' }));
    expect(state.lastMap!.addLayer).toHaveBeenCalledWith(expect.objectContaining({ id: 'routes-line' }));
    await waitFor(() => expect(state.lastMap!.sources.routes.setData).toHaveBeenCalled());
  });

  it('selects a journey when its route is clicked', async () => {
    const onSelectTrip = vi.fn();
    mockProbe.mockResolvedValue(true);
    renderPanel({
      board: { lanes: [lane({ routeGeometry: '_p~iF~ps|U_ulLnnqC_mqNvxq`@' })], legsById: {}, unassignedLegIds: [] },
      onSelectTrip,
    });

    await waitFor(() => expect(state.lastMap).not.toBeNull());
    act(() => {
      state.lastMap!.fire('load');
      state.lastMap!.fire('click:routes-line', { features: [{ properties: { tripId: 'trip-1' } }] });
    });

    expect(onSelectTrip).toHaveBeenCalledWith('trip-1');
  });

  it('renders a numbered marker for a planned stop, clicking it selects its journey', async () => {
    const onSelectTrip = vi.fn();
    mockProbe.mockResolvedValue(true);
    const legsById = { 'leg-1': leg({ door: { origin: { latitude: 41.53, longitude: -8.62 }, destination: null } }) };
    renderPanel({
      board: {
        lanes: [
          lane({
            stops: [
              {
                id: 's1',
                tripId: 'trip-1',
                sequence: 1,
                kind: TripStopKind.PICKUP,
                transportLegId: 'leg-1',
                facilityId: null,
                address: null,
                latitude: null,
                longitude: null,
                plannedAt: '2026-09-16T08:00:00.000Z',
                actualAt: null,
                dwellDecision: null,
                dwellMinutes: null,
                createdAt: '',
                updatedAt: '',
              },
            ],
          }),
        ],
        legsById,
        unassignedLegIds: [],
      },
      onSelectTrip,
    });

    await waitFor(() => expect(state.lastMap).not.toBeNull());
    act(() => state.lastMap!.fire('load'));
    await waitFor(() => expect(screen.getByTitle('#1')).toBeInTheDocument());

    act(() => screen.getByTitle('#1').click());
    expect(onSelectTrip).toHaveBeenCalledWith('trip-1');
  });

  it('fits the map to every drawn point when "fit the whole day" is pressed', async () => {
    mockProbe.mockResolvedValue(true);
    renderPanel({
      board: { lanes: [lane({ routeGeometry: '_p~iF~ps|U_ulLnnqC_mqNvxq`@' })], legsById: {}, unassignedLegIds: [] },
    });

    await waitFor(() => expect(state.lastMap).not.toBeNull());
    act(() => state.lastMap!.fire('load'));

    act(() => {
      screen.getByLabelText('Fit the whole day').click();
    });
    expect(state.lastMap!.fitBounds).toHaveBeenCalled();
  });

  it('labels a stop marker by vehicle and journey number when every journey is visible', async () => {
    mockProbe.mockResolvedValue(true);
    const legsById = { 'leg-1': leg({ door: { origin: { latitude: 41.53, longitude: -8.62 }, destination: null } }) };
    renderPanel({
      board: {
        lanes: [lane({ vehicle: { numeroCauda: '205' } as never, journeyNumber: 3, stops: [stop({ sequence: 1 })] })],
        legsById,
        unassignedLegIds: [],
      },
    });

    await waitFor(() => expect(state.lastMap).not.toBeNull());
    act(() => state.lastMap!.fire('load'));

    expect(await screen.findByText('205-3')).toBeInTheDocument();
  });

  it('switches a focused journey to hide the others (not merely dim them) and label by stop order', async () => {
    mockProbe.mockResolvedValue(true);
    const legsById = {
      'leg-1': leg({ door: { origin: { latitude: 41.53, longitude: -8.62 }, destination: null } }),
      'leg-2': leg({ door: { origin: { latitude: 41.6, longitude: -8.5 }, destination: null } }),
    };
    const { rerender } = renderPanel({
      board: {
        lanes: [
          lane({ trip: { id: 'trip-1' } as never, journeyNumber: 1, stops: [stop({ tripId: 'trip-1' })] }),
          lane({
            trip: { id: 'trip-2' } as never,
            journeyNumber: 2,
            stops: [stop({ id: 's2', tripId: 'trip-2', transportLegId: 'leg-2' })],
          }),
        ],
        legsById,
        unassignedLegIds: [],
      },
    });

    await waitFor(() => expect(state.lastMap).not.toBeNull());
    act(() => state.lastMap!.fire('load'));
    await screen.findByText('101-1');

    rerender(
      <AdminContext dataProvider={testDataProvider()} i18nProvider={polyglotI18nProvider(messages, 'en')}>
        <MapPanel
          board={{
            lanes: [
              lane({ trip: { id: 'trip-1' } as never, journeyNumber: 1, stops: [stop({ tripId: 'trip-1' })] }),
              lane({
                trip: { id: 'trip-2' } as never,
                journeyNumber: 2,
                stops: [stop({ id: 's2', tripId: 'trip-2', transportLegId: 'leg-2' })],
              }),
            ],
            legsById,
            unassignedLegIds: [],
          }}
          selectedTripId="trip-1"
          onSelectTrip={vi.fn()}
        />
      </AdminContext>,
    );

    // The selected journey's marker now reads its own stop order...
    expect(await screen.findByText('1')).toBeInTheDocument();
    // ...and the other journey's marker is hidden outright, not dimmed.
    expect(screen.getByText('101-2').style.opacity).toBe('0');
    expect(state.lastMap!.setPaintProperty).toHaveBeenCalledWith('routes-line', 'line-opacity', [
      'case',
      ['==', ['get', 'tripId'], 'trip-1'],
      1,
      0,
    ]);
    expect(state.lastMap!.fitBounds).toHaveBeenCalled();
  });

  it('shows the corridor overlap hint and can be dismissed', async () => {
    mockProbe.mockResolvedValue(true);
    const geometry = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';
    const window_ = { startsAt: '2026-09-16T08:00:00.000Z', endsAt: '2026-09-16T09:00:00.000Z' };
    renderPanel({
      board: {
        lanes: [
          lane({ trip: { id: 'trip-1' } as never, journeyNumber: 1, routeGeometry: geometry, occupancyWindow: window_ }),
          lane({ trip: { id: 'trip-2' } as never, journeyNumber: 2, routeGeometry: geometry, occupancyWindow: window_ }),
        ],
        legsById: {},
        unassignedLegIds: [],
      },
    });

    await waitFor(() => expect(state.lastMap).not.toBeNull());
    act(() => state.lastMap!.fire('load'));

    expect(await screen.findByText('Possible corridor overlaps')).toBeInTheDocument();
    act(() => screen.getByLabelText('Dismiss').click());
    expect(screen.queryByText('Possible corridor overlaps')).not.toBeInTheDocument();
  });

  it('opens the map in fullscreen from a button beside the fit-to-day control', async () => {
    const requestFullscreen = vi.fn();
    Element.prototype.requestFullscreen = requestFullscreen;
    mockProbe.mockResolvedValue(true);
    renderPanel({
      board: { lanes: [lane({ routeGeometry: '_p~iF~ps|U_ulLnnqC_mqNvxq`@' })], legsById: {}, unassignedLegIds: [] },
    });

    await waitFor(() => expect(state.lastMap).not.toBeNull());
    act(() => state.lastMap!.fire('load'));

    act(() => screen.getByLabelText('Fullscreen').click());
    expect(requestFullscreen).toHaveBeenCalled();
  });
});
