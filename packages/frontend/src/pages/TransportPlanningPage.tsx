import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Title, useGetMany, useNotify } from 'react-admin';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import {
  TransportPlanningBoard,
  TransportPlanningLane,
  TripStopKind,
  User,
  VehicleOccupancy,
  VehicleOccupancySource,
} from '@redinfo/shared';
import { apiFetch, ApiError } from '../api';
import { apiErrorLabel } from '../i18n/labels';
import { useT } from '../i18n/useT';
import { toIsoDate } from '../utils/dates';
import { AssignLegDialog, AssignLegDialogTarget } from './transportPlanning/AssignLegDialog';
import { AddVehicleLaneDialog } from './transportPlanning/AddVehicleLaneDialog';
import { WaitReleaseDialog, WaitReleaseTarget } from './transportPlanning/WaitReleaseDialog';
import { PlanningLegend } from './transportPlanning/PlanningLegend';
import { UnassignedLegCard } from './transportPlanning/UnassignedLegCard';
import { VehicleGroup } from './transportPlanning/VehicleGroup';
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
const DEFAULT_LEG_DURATION_MINUTES = 30;

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
  const [date, setDate] = useState(() => toIsoDate(new Date()));
  const [board, setBoard] = useState<TransportPlanningBoard | null>(null);
  const [occupancy, setOccupancy] = useState<VehicleOccupancy[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [assignTarget, setAssignTarget] = useState<AssignLegDialogTarget | null>(null);
  const [waitReleaseTarget, setWaitReleaseTarget] = useState<WaitReleaseTarget | null>(null);
  const [addVehicleOpen, setAddVehicleOpen] = useState(false);
  const [zoomIndex, setZoomIndex] = useState(0);
  const [isDragActive, setDragActive] = useState(false);
  const [trackWidth, setTrackWidth] = useState(0);
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

  // Crew names for the journey headers. `TripCrewMember` carries only the
  // user id, and the manifest a driver works from leads with who is driving —
  // so does the printed sheet this board replaces.
  const crewUserIds = useMemo(
    () => [...new Set((board?.lanes ?? []).flatMap((lane) => lane.crewMembers.map((member) => member.userId)))],
    [board],
  );
  const { data: crewUsers } = useGetMany<User>('users', { ids: crewUserIds }, { enabled: crewUserIds.length > 0 });
  const crewNamesByTripId = useMemo(() => {
    const nameById = new Map((crewUsers ?? []).map((user) => [user.id, `${user.firstName} ${user.lastName}`.trim()]));
    return Object.fromEntries(
      (board?.lanes ?? []).map((lane) => [
        lane.trip.id,
        lane.crewMembers.map((member) => nameById.get(member.userId)).filter((name): name is string => !!name),
      ]),
    );
  }, [board, crewUsers]);

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

      {loadError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {loadError}
        </Alert>
      )}
      {loading && <CircularProgress />}

      {!loading && board && (
        <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} sx={{ minWidth: 0, alignItems: 'flex-start' }}>
          <Box sx={{ width: { xs: '100%', lg: 280 }, flexShrink: 0, minWidth: 0 }}>
            <Typography variant="subtitle1" sx={{ mb: 1 }}>
              {t('transportPlanning.railTitle')}
            </Typography>
            {board.unassignedLegIds.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                {t('transportPlanning.railEmpty')}
              </Typography>
            )}
            <Stack spacing={1}>
              {board.unassignedLegIds.map((legId) => {
                const leg = board.legsById[legId];
                if (!leg) return null;
                return (
                  <UnassignedLegCard
                    key={legId}
                    leg={leg}
                    onDragStart={() => setDragActive(true)}
                    onDragEnd={() => setDragActive(false)}
                    onAssign={() =>
                      setAssignTarget({
                        legId,
                        tripId: '',
                        pickupPlannedAt:
                          leg.plannedPickupAt ?? leg.suggested.pickupAt ?? new Date().toISOString(),
                        dropoffPlannedAt:
                          leg.plannedDropoffAt ??
                          leg.suggested.dropoffAt ??
                          new Date(Date.now() + DEFAULT_LEG_DURATION_MINUTES * 60_000).toISOString(),
                      })
                    }
                  />
                );
              })}
            </Stack>
          </Box>

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
            }}
          >
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

            <Paper variant="outlined" sx={{ minWidth: 0, overflow: 'hidden' }}>
              <Box
                ref={scrollRef}
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
                      lanes={group.lanes}
                      crewNamesByTripId={crewNamesByTripId}
                      legsById={board.legsById}
                      timelineWindow={timelineWindow}
                      occupancy={occupancy.filter((block) => block.vehicleId === group.vehicle.id)}
                      isDragActive={isDragActive}
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

            <Paper variant="outlined" sx={{ p: 2, mt: 2, minWidth: 0 }}>
              <Typography variant="subtitle1" sx={{ mb: 1 }}>
                {t('transportPlanning.issuesTitle')}
              </Typography>
              {issues.length === 0 && (
                <Typography variant="body2" color="text.secondary">
                  {t('transportPlanning.issuesEmpty')}
                </Typography>
              )}
              <Stack spacing={0.5}>
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
            </Paper>
          </Box>
        </Stack>
      )}

      <AssignLegDialog
        target={assignTarget}
        lanes={board?.lanes ?? []}
        onClose={() => setAssignTarget(null)}
        onSaved={() => {
          notify(t('transportPlanning.assigned'));
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
    </Box>
  );
};
