import { useCallback, useEffect, useMemo, useState } from 'react';
import { Title, useNotify } from 'react-admin';
import { Alert, Box, Button, Chip, CircularProgress, Paper, Stack, TextField, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import {
  TransportPlanningBoard,
  TripStopKind,
  VehicleOccupancy,
  VehicleOccupancySource,
} from '@redinfo/shared';
import { apiFetch, ApiError } from '../api';
import { apiErrorLabel } from '../i18n/labels';
import { useT } from '../i18n/useT';
import { toIsoDate } from '../utils/dates';
import { MobilityChip } from '../resources/patients/patientChips';
import { AssignLegDialog, AssignLegDialogTarget } from './transportPlanning/AssignLegDialog';
import { AddVehicleLaneDialog } from './transportPlanning/AddVehicleLaneDialog';
import { WaitReleaseDialog, WaitReleaseTarget } from './transportPlanning/WaitReleaseDialog';
import { PlanningLane } from './transportPlanning/PlanningLane';
import { computeTimelineWindow, diffMinutes, isoFromDateAndMinutes, minutesToX, snapMinutes } from './transportPlanning/planningTime';

const ISSUE_RANK: Record<string, number> = { ERROR: 0, WARNING: 1, NOTE: 2 };
const DEFAULT_LEG_DURATION_MINUTES = 30;

function legDurationMinutes(board: TransportPlanningBoard, legId: string): number {
  for (const lane of board.lanes) {
    const pickup = lane.stops.find((s) => s.transportLegId === legId && s.kind === TripStopKind.PICKUP);
    const dropoff = lane.stops.find((s) => s.transportLegId === legId && s.kind === TripStopKind.DROPOFF);
    if (pickup && dropoff) return diffMinutes(pickup.plannedAt, dropoff.plannedAt);
  }
  const leg = board.legsById[legId];
  if (leg?.plannedPickupAt && leg?.plannedDropoffAt) return diffMinutes(leg.plannedPickupAt, leg.plannedDropoffAt);
  return DEFAULT_LEG_DURATION_MINUTES;
}

/**
 * Timeline lanes with drag assignment, dwell and empty running visible
 * (#235) — the manual planning board Feature #219 defers automatic
 * optimisation for. See `PlanningLane` for the per-vehicle row and
 * `AssignLegDialog` for the keyboard/dialog equivalent to dragging.
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

  const timelineWindow = useMemo(() => {
    if (!board) return computeTimelineWindow([]);
    const times = [
      ...board.lanes.flatMap((lane) => lane.stops.map((s) => s.plannedAt)),
      ...occupancy.map((o) => o.startsAt),
      ...occupancy.map((o) => o.endsAt),
    ];
    return computeTimelineWindow(times);
  }, [board, occupancy]);

  const issues = useMemo(() => {
    if (!board) return [];
    return board.lanes
      .flatMap((lane) => lane.issues.map((issue) => ({ ...issue, vehicleLabel: lane.vehicle.numeroCauda })))
      .sort((a, b) => (ISSUE_RANK[a.level] ?? 3) - (ISSUE_RANK[b.level] ?? 3));
  }, [board]);

  const handleDropLeg = useCallback(
    async ({ tripId, legId, dropMinutes }: { tripId: string; legId: string; dropMinutes: number }) => {
      if (!board) return;
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

  const totalWidth = minutesToX(timelineWindow.endMinutes, timelineWindow);

  return (
    <Box>
      <Title title={t('transportPlanning.pageTitle')} />
      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1} sx={{ mb: 2 }}>
        <Typography variant="h5">{t('transportPlanning.pageTitle')}</Typography>
        <TextField
          type="date"
          size="small"
          label={t('transportPlanning.dateLabel')}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
      </Stack>

      {loadError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {loadError}
        </Alert>
      )}
      {loading && <CircularProgress />}

      {!loading && board && (
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ minWidth: 0 }}>
          <Box sx={{ width: { xs: '100%', md: 300 }, flexShrink: 0 }}>
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
                  <Paper
                    key={legId}
                    variant="outlined"
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('application/json', JSON.stringify({ legId }))}
                    sx={{ p: 1, cursor: 'grab' }}
                  >
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                      <Stack spacing={0.5}>
                        <Typography variant="body2" fontWeight={600}>
                          {leg.patientName ?? t(`transportLeg.direction.${leg.direction}`)}
                        </Typography>
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <MobilityChip value={leg.patientMobility} />
                          {leg.plannedPickupAt && (
                            <Chip
                              size="small"
                              variant="outlined"
                              label={new Date(leg.plannedPickupAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            />
                          )}
                          {leg.arrivalWindowWarning && (
                            <ErrorOutlineIcon fontSize="small" color="warning" />
                          )}
                        </Stack>
                      </Stack>
                      <Button
                        size="small"
                        onClick={() =>
                          setAssignTarget({
                            legId,
                            tripId: '',
                            pickupPlannedAt: leg.plannedPickupAt ?? new Date().toISOString(),
                            dropoffPlannedAt:
                              leg.plannedDropoffAt ??
                              new Date(Date.now() + DEFAULT_LEG_DURATION_MINUTES * 60_000).toISOString(),
                          })
                        }
                      >
                        {t('transportPlanning.assignButton')}
                      </Button>
                    </Stack>
                  </Paper>
                );
              })}
            </Stack>
          </Box>

          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Button
              size="small"
              startIcon={<AddIcon />}
              onClick={() => setAddVehicleOpen(true)}
              sx={{ mb: 1 }}
            >
              {t('transportPlanning.addVehicleButton')}
            </Button>

            {board.lanes.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {t('transportPlanning.noLanes')}
              </Typography>
            )}

            <Box sx={{ overflowX: 'auto', minWidth: 0, WebkitOverflowScrolling: 'touch' }}>
              <Box sx={{ width: Math.max(totalWidth, 200), minWidth: '100%' }}>
                {board.lanes.map((lane) => {
                  const laneOccupancy = occupancy.filter((block) => block.vehicleId === lane.vehicle.id);
                  return (
                    <PlanningLane
                      key={lane.trip.id}
                      lane={lane}
                      legsById={board.legsById}
                      timelineWindow={timelineWindow}
                      occupancy={laneOccupancy}
                      onDragLegStart={() => undefined}
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
                  );
                })}
              </Box>
            </Box>

            <Paper variant="outlined" sx={{ p: 2, mt: 2 }}>
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
                      <ErrorOutlineIcon fontSize="small" color="disabled" />
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
