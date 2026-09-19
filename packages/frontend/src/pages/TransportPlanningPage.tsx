import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Title, useNotify } from 'react-admin';
import {
  Alert,
  Badge,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Drawer,
  IconButton,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CalendarViewWeekIcon from '@mui/icons-material/CalendarViewWeek';
import GroupsIcon from '@mui/icons-material/Groups';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import {
  TransportPlanningBoard,
  TransportPlanningLane,
  TripStopKind,
  VehicleOccupancy,
  VehicleOccupancySource,
} from '@redinfo/shared';
import { apiFetch, ApiError } from '../api';
import { apiErrorLabel } from '../i18n/labels';
import { useT } from '../i18n/useT';
import { toIsoDate } from '../utils/dates';
import { AssignGroupDialog } from './transportPlanning/AssignGroupDialog';
import { SuggestPlacementsDialog } from './transportPlanning/SuggestPlacementsDialog';
import { AssignLegDialog, AssignLegDialogTarget } from './transportPlanning/AssignLegDialog';
import { AddVehicleLaneDialog } from './transportPlanning/AddVehicleLaneDialog';
import { CrewDialog, CrewDialogTarget } from './transportPlanning/CrewDialog';
import { JourneyInspector } from './transportPlanning/JourneyInspector';
import { MapPanel } from './transportPlanning/map/MapPanel';
import { WaitReleaseDialog, WaitReleaseTarget } from './transportPlanning/WaitReleaseDialog';
import { PlanningLegend } from './transportPlanning/PlanningLegend';
import { UnplannedGroup, groupUnplannedLegs } from './transportPlanning/unplannedGroups';
import { UNASSIGNED_RAIL_WIDTH, UnassignedRail } from './transportPlanning/UnassignedRail';
import { DEFAULT_LEG_DURATION_MINUTES, assignTargetForLeg } from './transportPlanning/assignTarget';
import { VehicleGroup } from './transportPlanning/VehicleGroup';
import { WeekStrip } from './transportPlanning/WeekStrip';
import { LANE_LABEL_WIDTH } from './transportPlanning/PlanningLane';
import { TimelineRuler } from './transportPlanning/TimelineRuler';
import {
  ZOOM_STEPS,
  computeTimelineSpan,
  diffMinutes,
  isoFromDateAndMinutes,
  scaleToWidth,
  snapMinutes,
  timelineWidth,
} from './transportPlanning/planningTime';

const ISSUE_RANK: Record<string, number> = { ERROR: 0, WARNING: 1, NOTE: 2 };

/**
 * How long the vehicle is occupied by this leg, best information first: the
 * span already planned on the board, then the leg's own planned times, then
 * the routed travel time, and only then a flat fallback.
 *
 * The fallback exists because a drop has to produce *some* dropoff time, but
 * it is genuinely a guess — before #219's travel estimates were wired in it
 * was the only rule here, which meant every leg was drawn as half an hour
 * whether it crossed a village or the district.
 */
function legDurationMinutes(board: TransportPlanningBoard, legId: string): number {
  for (const lane of board.lanes) {
    const pickup = lane.stops.find((s) => s.transportLegId === legId && s.kind === TripStopKind.PICKUP);
    const dropoff = lane.stops.find((s) => s.transportLegId === legId && s.kind === TripStopKind.DROPOFF);
    if (pickup && dropoff) return diffMinutes(pickup.plannedAt, dropoff.plannedAt);
  }
  const leg = board.legsById[legId];
  if (leg?.plannedPickupAt && leg?.plannedDropoffAt) return diffMinutes(leg.plannedPickupAt, leg.plannedDropoffAt);
  if (leg?.travelMinutes != null && leg.travelMinutes > 0) return leg.travelMinutes;
  return DEFAULT_LEG_DURATION_MINUTES;
}

/** One group per vehicle, each holding that vehicle's journeys in the order
 * they run — see `VehicleGroup` for why a journey is a `Trip`. */
function groupLanesByVehicle(lanes: TransportPlanningLane[]) {
  const firstStopAt = (lane: TransportPlanningLane) =>
    lane.stops.length ? Math.min(...lane.stops.map((s) => new Date(s.plannedAt).getTime())) : Number.MAX_SAFE_INTEGER;
  const byVehicle = new Map<string, { vehicle: TransportPlanningLane['vehicle']; lanes: TransportPlanningLane[] }>();
  for (const lane of lanes) {
    const group = byVehicle.get(lane.vehicle.id) ?? { vehicle: lane.vehicle, lanes: [] };
    group.lanes.push(lane);
    byVehicle.set(lane.vehicle.id, group);
  }
  return [...byVehicle.values()]
    .map((group) => ({ ...group, lanes: [...group.lanes].sort((a, b) => firstStopAt(a) - firstStopAt(b)) }))
    .sort((a, b) => a.vehicle.numeroCauda.localeCompare(b.vehicle.numeroCauda));
}

/**
 * Timeline lanes with drag assignment, dwell and empty running visible
 * (#235) — the manual planning board Feature #219 defers automatic
 * optimisation for. See `PlanningLane` for one journey's row, `VehicleGroup`
 * for a vehicle's day, and `AssignLegDialog` for the keyboard/dialog
 * equivalent to dragging.
 */
export const TransportPlanningPage = () => {
  const t = useT();
  const notify = useNotify();
  // The date lives in the URL, not in component state, so a board is
  // linkable — the same `?date=` the vehicle and crew pages already read, so
  // the whole transport-planning family round-trips through one convention.
  const [searchParams, setSearchParams] = useSearchParams();
  const date = searchParams.get('date') || toIsoDate(new Date());
  const setDate = useCallback(
    (next: string) => {
      // A native date input reports '' while it is being retyped or when it
      // is cleared; loading a board for no date at all would just 400.
      if (!next) return;
      const params = new URLSearchParams(searchParams);
      params.set('date', next);
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams],
  );
  const [board, setBoard] = useState<TransportPlanningBoard | null>(null);
  const [occupancy, setOccupancy] = useState<VehicleOccupancy[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [assignTarget, setAssignTarget] = useState<AssignLegDialogTarget | null>(null);
  const [crewTarget, setCrewTarget] = useState<CrewDialogTarget | null>(null);
  const [waitReleaseTarget, setWaitReleaseTarget] = useState<WaitReleaseTarget | null>(null);
  const [addVehicleOpen, setAddVehicleOpen] = useState(false);
  const [zoomIndex, setZoomIndex] = useState(0);
  const [isDragActive, setDragActive] = useState(false);
  const [trackWidth, setTrackWidth] = useState(0);
  // Focus mode (#247 stage 1) — the one journey every other surface dims
  // around. A second click on the same journey clears it, same as clicking
  // away; see the board's own background `onClick` below for that path.
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  // The unplanned rail's own view (#247 stage 2) — grouped by default, since
  // that's the unit a planning decision is actually made in; "por pessoa"
  // reverts to the flat, one-card-per-leg list #235 shipped.
  const [perPersonView, setPerPersonView] = useState(false);
  const [assignGroupTarget, setAssignGroupTarget] = useState<UnplannedGroup | null>(null);
  const [suggestTarget, setSuggestTarget] = useState<UnplannedGroup | null>(null);
  // The unassigned rail's own hide (distinct from react-admin's nav drawer) —
  // a planner with every lane already assigned wants the map and timeline
  // wider more often than they want this list open. Hidden gives the board the
  // full width; the toolbar's "Por atribuir" button brings the list back as a
  // drawer, and its pin docks it again.
  const [railHidden, setRailHidden] = useState(false);
  const [railDrawerOpen, setRailDrawerOpen] = useState(false);
  const [issuesOpen, setIssuesOpen] = useState(false);
  // The week strip (#247 stage 6) — closed by default, same reasoning as the
  // rail's own collapse: most sessions are spent on one date's board, not
  // surveying the week.
  const [weekStripOpen, setWeekStripOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const loadBoard = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [boardResult, occupancyResult] = await Promise.all([
        apiFetch<TransportPlanningBoard>(`/trips/board?date=${date}`),
        apiFetch<VehicleOccupancy[]>(`/vehicle-occupancy?from=${date}T00:00:00.000&to=${date}T23:59:59.999`),
      ]);
      setBoard(boardResult);
      // Trip occupancy is already drawn from the board's own stops — this
      // only adds what transport code never queries directly (maintenance,
      // shift commitments), per #235's own acceptance criteria.
      setOccupancy(occupancyResult.filter((block) => block.source !== VehicleOccupancySource.TRANSPORT_TRIP));
    } catch (cause) {
      setLoadError(cause instanceof ApiError ? apiErrorLabel(t, cause) : t('transportPlanning.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [date, t]);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  // The timeline is scaled to the width actually available rather than to a
  // fixed pixels-per-minute, which is what keeps the board inside the page:
  // see `scaleToWidth`.
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const measure = () => setTrackWidth(Math.max(0, element.clientWidth - LANE_LABEL_WIDTH));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [board]);

  const timelineWindow = useMemo(() => {
    const span = computeTimelineSpan(
      board
        ? [
            ...board.lanes.flatMap((lane) => lane.stops.map((s) => s.plannedAt)),
            // Every leg the day knows about, assigned or not, so the axis is
            // already wide enough for a leg before it is dragged on and does
            // not jump underneath the planner at the moment of the drop.
            ...Object.values(board.legsById).flatMap((leg) =>
              [
                leg.appointmentAt,
                leg.effectiveEstimatedEndAt,
                leg.plannedPickupAt,
                leg.plannedDropoffAt,
                leg.suggested.pickupAt,
                leg.suggested.dropoffAt,
              ].filter((iso): iso is string => !!iso),
            ),
            ...occupancy.map((o) => o.startsAt),
            ...occupancy.map((o) => o.endsAt),
          ]
        : [],
    );
    return scaleToWidth(span, trackWidth, ZOOM_STEPS[zoomIndex]);
  }, [board, occupancy, trackWidth, zoomIndex]);

  const vehicleGroups = useMemo(() => (board ? groupLanesByVehicle(board.lanes) : []), [board]);

  const unplannedGroups = useMemo(
    () => (board ? groupUnplannedLegs(board.unassignedLegIds, board.legsById) : []),
    [board],
  );

  // The selected journey's own lane, re-read from the freshly-loaded board
  // every render — same reasoning as `crewDialogTarget` above: the inspector
  // must never show one edit stale.
  const selectedLane = useMemo(
    () => (board && selectedTripId ? board.lanes.find((candidate) => candidate.trip.id === selectedTripId) ?? null : null),
    [board, selectedTripId],
  );

  // The dialog stays open across an add/remove, so it must read the lane from
  // the board that was just reloaded rather than from the snapshot taken when
  // it was opened — otherwise the crew list it shows is always one edit stale.
  const crewDialogTarget = useMemo(() => {
    if (!crewTarget || !board) return null;
    const lane = board.lanes.find((candidate) => candidate.trip.id === crewTarget.lane.trip.id);
    return lane ? { ...crewTarget, lane } : null;
  }, [crewTarget, board]);

  const issues = useMemo(() => {
    if (!board) return [];
    return board.lanes
      .flatMap((lane) => lane.issues.map((issue) => ({ ...issue, vehicleLabel: lane.vehicle.numeroCauda })))
      .sort((a, b) => (ISSUE_RANK[a.level] ?? 3) - (ISSUE_RANK[b.level] ?? 3));
  }, [board]);

  const handleDropLeg = useCallback(
    async ({ tripId, legId, dropMinutes }: { tripId: string; legId: string; dropMinutes: number }) => {
      if (!board) return;
      setDragActive(false);
      const snapped = snapMinutes(dropMinutes);
      const pickupPlannedAt = isoFromDateAndMinutes(date, snapped);
      const dropoffPlannedAt = isoFromDateAndMinutes(date, snapped + legDurationMinutes(board, legId));
      try {
        await apiFetch(`/trips/${tripId}/legs`, {
          method: 'POST',
          body: { transportLegId: legId, pickupPlannedAt, dropoffPlannedAt },
        });
        notify(t('transportPlanning.assigned'));
        loadBoard();
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 409) {
          setAssignTarget({ legId, tripId, pickupPlannedAt, dropoffPlannedAt, conflictMessage: cause.message });
        } else {
          notify(cause instanceof ApiError ? apiErrorLabel(t, cause) : t('transportPlanning.assignFailed'), {
            type: 'error',
          });
        }
      }
    },
    [board, date, notify, t, loadBoard],
  );

  const selectJourney = useCallback((tripId: string) => {
    setSelectedTripId((current) => (current === tripId ? null : tripId));
  }, []);

  /** Open the assignment dialog for one person — shared by the rail's flat
   * "por pessoa" card and a group card's per-person row, so the two can never
   * disagree about a leg's default pickup/dropoff. */
  const assignLeg = useCallback(
    (legId: string) => {
      const leg = board?.legsById[legId];
      if (leg) setAssignTarget(assignTargetForLeg(legId, leg));
    },
    [board],
  );

  const handleAddJourney = useCallback(
    async (vehicleId: string) => {
      try {
        await apiFetch('/trips', { method: 'POST', body: { date, vehicleId } });
        loadBoard();
      } catch (cause) {
        notify(cause instanceof ApiError ? apiErrorLabel(t, cause) : t('transportPlanning.addVehicleFailed'), {
          type: 'error',
        });
      }
    },
    [date, loadBoard, notify, t],
  );

  return (
    // `minWidth: 0` is load-bearing, not tidiness. Without it this page's own
    // root refuses to shrink below its widest child and the timeline drags the
    // whole layout sideways — the same flex `min-width: auto` trap `theme.ts`
    // patches for RaLayout/RaList.
    <Box sx={{ minWidth: 0 }}>
      <Title title={t('transportPlanning.pageTitle')} />
      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1} sx={{ mb: 2 }}>
        <Typography variant="h5">{t('transportPlanning.pageTitle')}</Typography>
        <Stack direction="row" alignItems="center" gap={1}>
          {/* Only while the rail is hidden — when it is docked it is already
              on screen, and a button to summon what you can see is noise. */}
          {railHidden && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<GroupsIcon />}
              onClick={() => setRailDrawerOpen(true)}
            >
              {t('transportPlanning.railTitle')}
              <Badge
                badgeContent={board?.unassignedLegIds.length ?? 0}
                color="primary"
                sx={{ ml: 1.5, mr: 0.5 }}
              />
            </Button>
          )}
          <Tooltip title={t('transportPlanning.issuesTitle')}>
            <IconButton
              size="small"
              aria-label={t('transportPlanning.issuesButtonAria', { count: issues.length })}
              onClick={() => setIssuesOpen(true)}
            >
              <Badge
                badgeContent={issues.length}
                color={issues.some((issue) => issue.level === 'ERROR') ? 'error' : 'warning'}
              >
                <WarningAmberIcon />
              </Badge>
            </IconButton>
          </Tooltip>
          <Tooltip title={t('transportPlanning.zoomOut')}>
            <span>
              <IconButton size="small" disabled={zoomIndex === 0} onClick={() => setZoomIndex((i) => i - 1)}>
                <ZoomOutIcon />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title={t('transportPlanning.zoomIn')}>
            <span>
              <IconButton
                size="small"
                disabled={zoomIndex === ZOOM_STEPS.length - 1}
                onClick={() => setZoomIndex((i) => i + 1)}
              >
                <ZoomInIcon />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title={t('transportPlanning.weekStripToggle')}>
            <IconButton
              size="small"
              aria-label={t('transportPlanning.weekStripToggle')}
              color={weekStripOpen ? 'primary' : 'default'}
              onClick={() => setWeekStripOpen((open) => !open)}
            >
              <CalendarViewWeekIcon />
            </IconButton>
          </Tooltip>
          <TextField
            type="date"
            size="small"
            label={t('transportPlanning.dateLabel')}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ width: 170 }}
          />
        </Stack>
      </Stack>

      {weekStripOpen && <WeekStrip date={date} onSelectDate={setDate} />}

      {loadError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {loadError}
        </Alert>
      )}
      {loading && <CircularProgress />}

      {!loading && board && (
        <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} sx={{ minWidth: 0, alignItems: 'flex-start' }}>
          {/* Hidden means *gone*, not a 40px stub: the collapsed rail used to
              keep a whole column for a single chevron. What replaces it is the
              "Por atribuir" button in the toolbar above, which reopens this
              same list in a drawer. */}
          {!railHidden && (
            <Box sx={{ width: { xs: '100%', lg: UNASSIGNED_RAIL_WIDTH }, flexShrink: 0, minWidth: 0 }}>
              <UnassignedRail
                board={board}
                unplannedGroups={unplannedGroups}
                perPersonView={perPersonView}
                onPerPersonViewChange={setPerPersonView}
                onDragStart={() => setDragActive(true)}
                onDragEnd={() => setDragActive(false)}
                onAssignLeg={assignLeg}
                onAssignGroup={setAssignGroupTarget}
                onSuggestPlacements={setSuggestTarget}
                onHide={() => setRailHidden(true)}
              />
            </Box>
          )}

          {/*
            `minmax(0, 1fr)` is what actually keeps this page inside the
            viewport, and it is not interchangeable with `minWidth: 0`.

            `theme.ts` relaxes react-admin's flex chain only below `sm`, on
            purpose — above that, `.layout`'s `min-width: fit-content` is
            protecting the docked sidebar from being squeezed. So on desktop
            `RaLayout-content` keeps `min-width: auto` and is sized by its
            content's minimum, which means any `min-width: 0` *inside* this
            page is applied too late: the chain above has already grown.

            A grid track with a zero minimum fixes it from the other end. It
            caps this subtree's min-content contribution at zero, so the
            timeline can never inflate an ancestor no matter how far it is
            zoomed in, and `overflowX` below actually clips instead of
            silently giving up.
          */}
          <Box
            sx={{
              flexGrow: 1,
              minWidth: 0,
              alignSelf: 'stretch',
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr)',
              // `alignSelf: stretch` above makes this column as tall as the
              // unassigned rail beside it, and a grid's auto rows *share out*
              // that surplus height — so a tall rail pushed the map, the
              // toolbar and the timeline apart with hundreds of pixels of
              // dead space between them. Packing the rows to the top leaves
              // the surplus at the bottom, where it belongs.
              alignContent: 'start',
            }}
          >
            {/*
              Above the timeline, per the design doc's §2 layout decision —
              never a separate tab, the same shared selection
              (`selectedTripId`) as the rail/timeline/inspector. Hidden below
              `md`: this is a desktop planning tool (§7), and a WebGL canvas
              has no useful degrade at tablet width the way the timeline's
              own horizontal scroll does.
            */}
            <Box sx={{ display: { xs: 'none', md: 'block' } }}>
              <MapPanel board={board} selectedTripId={selectedTripId} onSelectTrip={selectJourney} />
            </Box>

            <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1} sx={{ mb: 1 }}>
              <Button size="small" startIcon={<AddIcon />} onClick={() => setAddVehicleOpen(true)}>
                {t('transportPlanning.addVehicleButton')}
              </Button>
              <PlanningLegend />
            </Stack>

            {board.lanes.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {t('transportPlanning.noLanes')}
              </Typography>
            )}

            <Paper
              variant="outlined"
              sx={{ minWidth: 0, overflow: 'hidden' }}
              // Clicking the board's own background — never a lane, which
              // stops the click reaching here — restores the full board
              // (#247 stage 1's "clicking away" acceptance criterion).
              onClick={(e) => {
                if (e.target === e.currentTarget) setSelectedTripId(null);
              }}
            >
              <Box
                ref={scrollRef}
                onClick={(e) => {
                  if (e.target === e.currentTarget) setSelectedTripId(null);
                }}
                sx={{
                  overflowX: 'auto',
                  overflowY: 'visible',
                  minWidth: 0,
                  WebkitOverflowScrolling: 'touch',
                  // At zoom 1 the content is exactly the track width, so
                  // nothing scrolls; every step above that scrolls here and
                  // only here.
                  maxHeight: '70vh',
                }}
              >
                <Box sx={{ width: Math.max(timelineWidth(timelineWindow) + LANE_LABEL_WIDTH, 0), minWidth: '100%' }}>
                  {board.lanes.length > 0 && (
                    <TimelineRuler timelineWindow={timelineWindow} labelColumnWidth={LANE_LABEL_WIDTH} />
                  )}
                  {vehicleGroups.map((group) => (
                    <VehicleGroup
                      key={group.vehicle.id}
                      vehicle={group.vehicle}
                      date={date}
                      lanes={group.lanes}
                      legsById={board.legsById}
                      timelineWindow={timelineWindow}
                      occupancy={occupancy.filter((block) => block.vehicleId === group.vehicle.id)}
                      isDragActive={isDragActive}
                      selectedTripId={selectedTripId}
                      onSelectJourney={selectJourney}
                      onAddJourney={handleAddJourney}
                      onDropLeg={handleDropLeg}
                      onEditAssignment={(legId, tripId, pickup, dropoff) =>
                        setAssignTarget({
                          legId,
                          tripId,
                          pickupPlannedAt: pickup.plannedAt,
                          dropoffPlannedAt: dropoff.plannedAt,
                        })
                      }
                      onEditCrew={(lane, journeyNumber) => setCrewTarget({ lane, journeyNumber, date })}
                      onWaitRelease={(tripId, dropoffStop) =>
                        setWaitReleaseTarget({
                          tripId,
                          dropoffStopId: dropoffStop.id,
                          facilityId: dropoffStop.facilityId,
                          plannedAt: dropoffStop.plannedAt,
                        })
                      }
                    />
                  ))}
                </Box>
              </Box>
            </Paper>

          </Box>

          {selectedLane && (
            <Box sx={{ width: { xs: '100%', lg: 300 }, flexShrink: 0, minWidth: 0 }}>
              <JourneyInspector
                lane={selectedLane}
                legsById={board.legsById}
                onClose={() => setSelectedTripId(null)}
                onEditCrew={() => setCrewTarget({ lane: selectedLane, journeyNumber: selectedLane.journeyNumber, date })}
              />
            </Box>
          )}
        </Stack>
      )}

      {/* The hidden rail, on demand. Temporary rather than persistent: a
          planner who hid it wants the board wide, so this is for picking the
          next thing to place and getting out of the way again — or pinning it
          back, which is what `onDock` does. */}
      <Drawer anchor="left" open={railDrawerOpen} onClose={() => setRailDrawerOpen(false)}>
        <Box sx={{ width: UNASSIGNED_RAIL_WIDTH, p: 1.5 }}>
          {board && (
            <UnassignedRail
              board={board}
              unplannedGroups={unplannedGroups}
              perPersonView={perPersonView}
              onPerPersonViewChange={setPerPersonView}
              onDragStart={() => setDragActive(true)}
              onDragEnd={() => setDragActive(false)}
              onAssignLeg={(legId) => {
                setRailDrawerOpen(false);
                assignLeg(legId);
              }}
              onAssignGroup={(group) => {
                setRailDrawerOpen(false);
                setAssignGroupTarget(group);
              }}
              onSuggestPlacements={(group) => {
                setRailDrawerOpen(false);
                setSuggestTarget(group);
              }}
              onDock={() => {
                setRailDrawerOpen(false);
                setRailHidden(false);
              }}
            />
          )}
        </Box>
      </Drawer>

      <Dialog open={issuesOpen} onClose={() => setIssuesOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('transportPlanning.issuesTitle')}</DialogTitle>
        <DialogContent>
          {issues.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              {t('transportPlanning.issuesEmpty')}
            </Typography>
          )}
          <Stack spacing={1} sx={{ pt: 1 }}>
            {issues.map((issue, index) => (
              <Stack key={index} direction="row" spacing={1} alignItems="center">
                {issue.level === 'ERROR' ? (
                  <ErrorOutlineIcon fontSize="small" color="error" />
                ) : issue.level === 'WARNING' ? (
                  <WarningAmberIcon fontSize="small" color="warning" />
                ) : (
                  <InfoOutlinedIcon fontSize="small" color="disabled" />
                )}
                <Typography variant="body2">
                  {issue.vehicleLabel}: {issue.message}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIssuesOpen(false)}>{t('transportPlanning.issuesClose')}</Button>
        </DialogActions>
      </Dialog>

      <AssignLegDialog
        target={assignTarget}
        lanes={board?.lanes ?? []}
        onClose={() => setAssignTarget(null)}
        onSaved={() => {
          notify(t('transportPlanning.assigned'));
          loadBoard();
        }}
      />
      <CrewDialog
        target={crewDialogTarget}
        onClose={() => setCrewTarget(null)}
        onSaved={() => {
          notify(t('transportPlanning.crewSaved'));
          loadBoard();
        }}
      />
      <WaitReleaseDialog
        target={waitReleaseTarget}
        onClose={() => setWaitReleaseTarget(null)}
        onSaved={() => {
          notify(t('transportPlanning.waitReleaseSaved'));
          loadBoard();
        }}
      />
      <AddVehicleLaneDialog
        open={addVehicleOpen}
        date={date}
        excludeVehicleIds={board?.lanes.map((lane) => lane.vehicle.id) ?? []}
        onClose={() => setAddVehicleOpen(false)}
        onCreated={() => loadBoard()}
      />
      <AssignGroupDialog
        group={assignGroupTarget}
        lanes={board?.lanes ?? []}
        onClose={() => setAssignGroupTarget(null)}
        onSaved={() => {
          notify(t('transportPlanning.assigned'));
          loadBoard();
        }}
      />
      <SuggestPlacementsDialog
        group={suggestTarget}
        date={date}
        onClose={() => setSuggestTarget(null)}
        onSaved={() => {
          notify(t('transportPlanning.assigned'));
          loadBoard();
        }}
      />
    </Box>
  );
};
