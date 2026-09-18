import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, IconButton, Paper, Stack, Tooltip, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import FitScreenIcon from '@mui/icons-material/FitScreen';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import { MapLibreMap, Marker, NavigationControl, addProtocol, removeProtocol } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Protocol } from 'pmtiles';
import { TransportPlanningBoard, distanceInKm } from '@redinfo/shared';
import { useT } from '../../../i18n/useT';
import { buildBasemapStyle } from './basemapStyle';
import { bearingDegrees, clampToFrameEdge, findOverlaps } from './geometry';
import {
  StopMarker,
  UnplannedPin,
  buildRouteLines,
  buildStopMarkers,
  buildUnplannedPins,
  routeLinesToFeatureCollection,
} from './routeFeatures';
import { TILES_URL, probeTilesAvailable } from './tilesAvailability';

/** A non-selected route/marker's opacity once a journey is focused — fully
 * hidden, not merely dimmed: with several routes overlapping, "still
 * visible" was itself the clutter a focused journey is supposed to cut
 * through. `PlanningLane`'s own focus-mode dimming is a separate, still
 * partial, opacity — the timeline has room for every lane at once in a way
 * the map, drawn on top of itself, does not. */
const HIDDEN_OPACITY = 0;

// Braga — the delegation's own base, and the centre of the region
// `scripts/prepare-basemap.sh`'s default bbox covers.
const DEFAULT_CENTER: [number, number] = [-8.42, 41.55];
const DEFAULT_ZOOM = 9;

interface OffFrameChevron {
  tripId: string;
  journeyNumber: number;
  color: string;
  x: number;
  y: number;
  bearing: number;
  distanceKm: number;
}

export interface MapPanelProps {
  board: Pick<TransportPlanningBoard, 'lanes' | 'legsById' | 'unassignedLegIds'>;
  selectedTripId: string | null;
  /** Matches `TransportPlanningPage`'s own `selectJourney` — a toggle, not
   * a set: clicking the already-selected journey's route or marker clears
   * the focus, same as clicking its lane does. */
  onSelectTrip: (tripId: string) => void;
}

/**
 * The map panel (#247 stage 4) — one shared selection with the timeline and
 * the inspector, per the design doc's §2 decision. Degrades to a plain
 * notice, never a broken map, when the basemap file isn't on disk yet (see
 * `probeTilesAvailable`) — the rest of the board stays fully usable either
 * way.
 *
 * Facility markers are folded into the numbered stop markers rather than a
 * separate layer: a `DROPOFF` stop already sits on the facility's own door
 * (`buildStopMarkers`'s doc comment), so a second marker at the same point
 * would only duplicate it. Place-name labels are left for a later pass —
 * see `basemapStyle.ts` for why they'd need a self-hosted font host this
 * stage doesn't stand up.
 */
export function MapPanel({ board, selectedTripId, onSelectTrip }: MapPanelProps) {
  const t = useT();
  const paperRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // The overlap hint is data-driven (it reappears the moment the day's
  // overlaps actually change), so what's dismissed is the *content*, not a
  // one-shot flag — the sorted pair-id signature it was shown with, not
  // just "has this been closed once".
  const [dismissedOverlapKey, setDismissedOverlapKey] = useState<string | null>(null);
  // Always the *current* board-data-sync closure — see that effect's own
  // doc comment for why the mount effect's `load` handler needs this
  // rather than calling a function captured at mount time.
  const applyDataRef = useRef<() => void>(() => {});
  // Same reasoning, for the off-frame chevrons: the map instance persists
  // across a date change (the mount effect only depends on `tilesAvailable`),
  // so a closure over `routes` captured once at mount would go stale the
  // first time the board's own data changes under it.
  const updateOffFrameChevronsRef = useRef<() => void>(() => {});
  const [tilesAvailable, setTilesAvailable] = useState<boolean | null>(null);
  const [offFrame, setOffFrame] = useState<OffFrameChevron[]>([]);

  useEffect(() => {
    let cancelled = false;
    probeTilesAvailable().then((available) => {
      if (!cancelled) setTilesAvailable(available);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const routes = useMemo(() => buildRouteLines(board.lanes), [board.lanes]);
  const pins = useMemo(() => buildUnplannedPins(board.unassignedLegIds, board.legsById), [board.unassignedLegIds, board.legsById]);
  const stopMarkers = useMemo(() => buildStopMarkers(board.lanes, board.legsById), [board.lanes, board.legsById]);

  const overlaps = useMemo(() => {
    const routeByTripId = new Map(routes.map((route) => [route.tripId, route.points]));
    const overlapLanes = board.lanes
      .filter((lane) => lane.occupancyWindow && routeByTripId.has(lane.trip.id))
      .map((lane) => ({
        tripId: lane.trip.id,
        journeyNumber: lane.journeyNumber,
        points: routeByTripId.get(lane.trip.id) ?? [],
        activeFrom: new Date(lane.occupancyWindow!.startsAt),
        activeTo: new Date(lane.occupancyWindow!.endsAt),
      }));
    return findOverlaps(overlapLanes);
  }, [board.lanes, routes]);

  const overlapKey = useMemo(
    () => [...overlaps.map((o) => `${o.tripIdA}-${o.tripIdB}`)].sort().join(','),
    [overlaps],
  );
  const showOverlapHint = overlaps.length > 0 && overlapKey !== dismissedOverlapKey;

  // Fullscreen is a browser-level toggle (Esc, or the browser's own exit
  // control, close it same as the button does) — this listener is what
  // keeps `isFullscreen` truthful either way, rather than only on the
  // button's own click. MapLibre sizes its canvas from the container's
  // layout box at construction time and does not repaint on a CSS-only
  // resize, so the explicit `resize()` call is required, not defensive.
  useEffect(() => {
    const handleChange = () => {
      setIsFullscreen(document.fullscreenElement === paperRef.current);
      requestAnimationFrame(() => mapRef.current?.resize());
    };
    document.addEventListener('fullscreenchange', handleChange);
    return () => document.removeEventListener('fullscreenchange', handleChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      paperRef.current?.requestFullscreen();
    }
  };

  // ── Mount / unmount the map instance itself, only once tiles are known
  // to be there. Re-created if `tilesAvailable` flips (e.g. a delegation
  // runs the prepare script while the board is open and refreshes).
  useEffect(() => {
    if (tilesAvailable !== true || !containerRef.current) return;

    const protocol = new Protocol();
    addProtocol('pmtiles', protocol.tile);

    const map = new MapLibreMap({
      container: containerRef.current,
      style: buildBasemapStyle(TILES_URL) as never,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
    });
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;

    map.on('load', () => {
      map.addSource('routes', { type: 'geojson', data: routeLinesToFeatureCollection([]) } as never);
      // White halo under the coloured stroke — what keeps two crossing
      // routes readable, per the design doc's §5 layer order.
      map.addLayer({
        id: 'routes-halo',
        type: 'line',
        source: 'routes',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 6, 'line-opacity': 0.85 },
      } as never);
      map.addLayer({
        id: 'routes-line',
        type: 'line',
        source: 'routes',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': 3, 'line-opacity': 1 },
      } as never);
      map.on('click', 'routes-line', (e: { features?: Array<{ properties?: Record<string, unknown> }> }) => {
        const tripId = e.features?.[0]?.properties?.tripId as string | undefined;
        if (tripId) onSelectTrip(tripId);
      });
      map.on('mouseenter', 'routes-line', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'routes-line', () => {
        map.getCanvas().style.cursor = '';
      });
      map.on('moveend', () => updateOffFrameChevronsRef.current());
      updateOffFrameChevronsRef.current();
      // The board data effect below may well have already run once by now
      // and found no source to write into (style loading is async, and
      // React's effects don't wait on it) — `applyDataRef` always holds
      // that effect's latest closure, so calling it here catches this
      // instance up rather than leaving it permanently empty.
      applyDataRef.current();
      // A page that mounts with a journey already selected (the standalone
      // journey page passes its own trip id from the start) needs its first
      // frame fitted too — the "focus mode" effect below only reacts to a
      // *change* in `selectedTripId`, which never fires when it was already
      // set before the map instance existed to fit anything on.
      if (selectedTripId) fitToPoints(pointsForTrip(selectedTripId), { maxZoom: 15 });
    });

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      map.remove();
      removeProtocol('pmtiles');
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tilesAvailable]);

  // ── Keep the routes source and DOM markers (pins, numbered stops) in
  // sync whenever the board data changes. `applyDataRef` — rather than
  // calling this inline — is what lets the mount effect's own `load`
  // handler (above) re-run the *current* version of this on-demand,
  // whichever of the two effects loses the race with MapLibre's own
  // asynchronous style load.
  useEffect(() => {
    applyDataRef.current = () => {
      const map = mapRef.current;
      if (!map) return;
      const source = map.getSource('routes') as { setData?: (data: unknown) => void } | undefined;
      source?.setData?.(routeLinesToFeatureCollection(routes) as never);

      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [
        ...pins.map((pin) => addPinMarker(map, pin)),
        ...stopMarkers.map((stop) => addStopMarker(map, stop, () => onSelectTrip(stop.tripId))),
      ];
      applyFocus(selectedTripId);
    };

    updateOffFrameChevronsRef.current = () => {
      const map = mapRef.current;
      const container = containerRef.current;
      if (!map || !container) return;
      const size = { width: container.clientWidth, height: container.clientHeight };
      // MapLibre's own `LngLat` is `{ lng, lat }` — converted once here to
      // this app's `{ latitude, longitude }` convention, the one every
      // other geometry helper (`distanceInKm`, `bearingDegrees`) expects.
      const mapCenter = map.getCenter();
      const center = { latitude: mapCenter.lat, longitude: mapCenter.lng };
      const chevrons: OffFrameChevron[] = [];

      for (const route of routes) {
        if (route.points.length === 0) continue;
        // The route's own farthest point from the map's current centre is
        // the one worth a chevron — a route that dips off-frame briefly in
        // the middle is still readable from its ends.
        const farthest = route.points.reduce((best, point) =>
          distanceInKm(center, point) > distanceInKm(center, best) ? point : best,
        );
        const projected = map.project([farthest.longitude, farthest.latitude]);
        const clamped = clampToFrameEdge(projected, size);
        if (!clamped) continue;
        chevrons.push({
          tripId: route.tripId,
          journeyNumber: route.journeyNumber,
          color: route.color,
          x: clamped.x,
          y: clamped.y,
          bearing: bearingDegrees(center, farthest),
          distanceKm: distanceInKm(center, farthest),
        });
      }
      setOffFrame(chevrons);
    };

    const map = mapRef.current;
    if (map?.isStyleLoaded()) {
      applyDataRef.current();
      updateOffFrameChevronsRef.current();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routes, pins, stopMarkers, tilesAvailable]);

  // ── Focus mode: hide every route/marker that isn't the selected journey,
  // and fit the map to it — a click is both "just this one" and "let me see
  // it properly", not two separate actions.
  useEffect(() => {
    applyFocus(selectedTripId);
    if (selectedTripId) fitToPoints(pointsForTrip(selectedTripId), { maxZoom: 15 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTripId]);

  function applyFocus(tripId: string | null) {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded() || !map.getLayer('routes-line')) return;
    const opacityExpression = tripId
      ? (['case', ['==', ['get', 'tripId'], tripId], 1, HIDDEN_OPACITY] as unknown as never)
      : (1 as unknown as never);
    map.setPaintProperty('routes-line', 'line-opacity', opacityExpression);
    markersRef.current.forEach((marker) => {
      const markerTripId = markerTripIds.get(marker);
      if (!markerTripId) return;
      const visible = !tripId || markerTripId === tripId;
      const el = marker.getElement();
      el.style.opacity = visible ? '1' : String(HIDDEN_OPACITY);
      el.style.pointerEvents = visible ? '' : 'none';
      // All journeys visible at once: label by vehicle + journey number,
      // since a bare stop sequence repeats across journeys and only colour
      // would otherwise tell them apart. Focused on one: label the focused
      // journey's own markers by stop order instead, the thing worth
      // reading up close — a hidden marker's label is moot, but is left on
      // the overview text rather than also flipping, so two unrelated
      // journeys sharing a sequence number never collide off-screen.
      const labels = markerLabels.get(marker);
      if (labels) el.textContent = tripId && visible ? labels.sequence : labels.overview;
    });
  }

  function pointsForTrip(tripId: string) {
    const route = routes.find((r) => r.tripId === tripId);
    return [...(route?.points ?? []), ...stopMarkers.filter((s) => s.tripId === tripId).map((s) => s.point)];
  }

  function fitToPoints(points: Array<{ latitude: number; longitude: number }>, options: { maxZoom: number }) {
    const map = mapRef.current;
    if (!map || points.length === 0) return;
    const lats = points.map((p) => p.latitude);
    const lngs = points.map((p) => p.longitude);
    map.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: 48, maxZoom: options.maxZoom, duration: 300 },
    );
  }

  const fitToDay = () => {
    fitToPoints(
      [...routes.flatMap((r) => r.points), ...pins.map((p) => p.point), ...stopMarkers.map((s) => s.point)],
      { maxZoom: 13 },
    );
  };

  if (tilesAvailable === false) {
    return (
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="body2">{t('transportPlanning.mapUnavailable')}</Typography>
        <Typography variant="caption" color="text.secondary">
          {t('transportPlanning.mapUnavailableHint')}
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper
      ref={paperRef}
      variant="outlined"
      sx={{
        mb: isFullscreen ? 0 : 2,
        overflow: 'hidden',
        position: 'relative',
        ...(isFullscreen && { height: '100vh', display: 'flex', flexDirection: 'column' }),
      }}
    >
      <Box
        ref={containerRef}
        data-testid="map-canvas"
        sx={{ height: isFullscreen ? '100%' : 340, width: '100%', bgcolor: 'grey.100', flexGrow: isFullscreen ? 1 : undefined }}
      />
      {tilesAvailable === null && (
        <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            {t('transportPlanning.mapLoading')}
          </Typography>
        </Box>
      )}
      {tilesAvailable === true && (
        <Stack direction="row" spacing={0.5} sx={{ position: 'absolute', top: 8, left: 8 }}>
          <Tooltip title={t('transportPlanning.mapFitToDay')}>
            <IconButton
              size="small"
              aria-label={t('transportPlanning.mapFitToDay')}
              onClick={fitToDay}
              sx={{ bgcolor: 'background.paper', '&:hover': { bgcolor: 'background.paper' } }}
            >
              <FitScreenIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={isFullscreen ? t('transportPlanning.mapExitFullscreen') : t('transportPlanning.mapFullscreen')}>
            <IconButton
              size="small"
              aria-label={isFullscreen ? t('transportPlanning.mapExitFullscreen') : t('transportPlanning.mapFullscreen')}
              onClick={toggleFullscreen}
              sx={{ bgcolor: 'background.paper', '&:hover': { bgcolor: 'background.paper' } }}
            >
              {isFullscreen ? <FullscreenExitIcon fontSize="small" /> : <FullscreenIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        </Stack>
      )}
      {offFrame.map((chevron) => (
        <Box
          key={chevron.tripId}
          sx={{
            position: 'absolute',
            left: chevron.x,
            top: chevron.y,
            transform: `translate(-50%, -50%) rotate(${chevron.bearing}deg)`,
            color: chevron.color,
            fontSize: 18,
            lineHeight: 1,
            pointerEvents: 'none',
          }}
        >
          ▲
          <Typography
            variant="caption"
            sx={{ position: 'absolute', top: '100%', left: '50%', transform: `translateX(-50%) rotate(${-chevron.bearing}deg)`, whiteSpace: 'nowrap', bgcolor: 'background.paper', px: 0.5, borderRadius: 0.5 }}
          >
            {t('transportPlanning.mapOffFrame', { distanceKm: chevron.distanceKm.toFixed(0), number: chevron.journeyNumber })}
          </Typography>
        </Box>
      ))}
      {showOverlapHint && (
        <Stack
          direction="row"
          spacing={1}
          alignItems="flex-start"
          sx={{ position: 'absolute', bottom: 8, left: 8, right: 8, bgcolor: 'background.paper', p: 1, borderRadius: 1, opacity: 0.95 }}
        >
          <Stack spacing={0.25} sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant="caption" fontWeight={600}>
              {t('transportPlanning.mapOverlapHintTitle')}
            </Typography>
            {overlaps.slice(0, 3).map((overlap) => (
              <Typography key={`${overlap.tripIdA}-${overlap.tripIdB}`} variant="caption">
                {t('transportPlanning.mapOverlapHint', {
                  a: overlap.journeyNumberA,
                  b: overlap.journeyNumberB,
                  distanceKm: overlap.distanceKm.toFixed(1),
                })}
              </Typography>
            ))}
          </Stack>
          <IconButton
            size="small"
            aria-label={t('transportPlanning.mapOverlapDismiss')}
            onClick={() => setDismissedOverlapKey(overlapKey)}
            sx={{ mt: -0.5, mr: -0.5 }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
      )}
    </Paper>
  );
}

// A `Marker`'s own instance is the only stable handle DOM listeners get —
// tracking each one's trip id in a side map (rather than stuffing an
// untyped property onto the instance) so `applyFocus` can hide a stop
// marker the same way it hides the route it belongs to.
const markerTripIds = new WeakMap<Marker, string>();

/** The two label strings `applyFocus` swaps a stop marker between —
 * computed once at creation, since neither depends on focus state. */
const markerLabels = new WeakMap<Marker, { sequence: string; overview: string }>();

function addPinMarker(map: MapLibreMap, pin: UnplannedPin): Marker {
  const el = document.createElement('div');
  el.title = pin.label;
  el.style.cssText =
    'width:12px;height:12px;border-radius:50%;background:#fff;border:2px dashed #6b6b6b;box-sizing:border-box;';
  return new Marker({ element: el }).setLngLat([pin.point.longitude, pin.point.latitude]).addTo(map);
}

function addStopMarker(map: MapLibreMap, stop: StopMarker, onClick: () => void): Marker {
  const el = document.createElement('div');
  const overviewLabel = `${stop.vehicleLabel}-${stop.journeyNumber}`;
  el.title = `#${stop.sequence}`;
  // Every journey visible at once starts out labelled by vehicle + journey
  // number — `applyFocus` swaps this to the stop's own sequence the moment
  // this trip is the one focused.
  el.textContent = overviewLabel;
  el.style.cssText = `min-width:20px;height:20px;padding:0 3px;border-radius:10px;background:${stop.color};color:#fff;font-size:10px;font-weight:600;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 0 0 2px #fff;`;
  el.addEventListener('click', (event) => {
    event.stopPropagation();
    onClick();
  });
  const marker = new Marker({ element: el }).setLngLat([stop.point.longitude, stop.point.latitude]).addTo(map);
  markerTripIds.set(marker, stop.tripId);
  markerLabels.set(marker, { sequence: String(stop.sequence), overview: overviewLabel });
  return marker;
}
