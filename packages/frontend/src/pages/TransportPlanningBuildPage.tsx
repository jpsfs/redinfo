import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { Title, useNotify } from 'react-admin';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  LinearProgress,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import AltRouteIcon from '@mui/icons-material/AltRoute';
import DirectionsBusIcon from '@mui/icons-material/DirectionsBus';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import GroupsIcon from '@mui/icons-material/Groups';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import {
  CERTIFICATION_LABEL,
  TransportPlanningBoard,
  TransportPlanningLane,
  TripCrewCandidate,
} from '@redinfo/shared';
import { apiFetch, ApiError } from '../api';
import { apiErrorLabel } from '../i18n/labels';
import { useT } from '../i18n/useT';
import { toIsoDate } from '../utils/dates';
import { AddVehicleLaneDialog } from './transportPlanning/AddVehicleLaneDialog';
import { AssignGroupDialog } from './transportPlanning/AssignGroupDialog';
import { AssignLegDialog, AssignLegDialogTarget } from './transportPlanning/AssignLegDialog';
import { assignTargetForLeg } from './transportPlanning/assignTarget';
import { CrewDialog, CrewDialogTarget } from './transportPlanning/CrewDialog';
import { SuggestPlacementsDialog } from './transportPlanning/SuggestPlacementsDialog';
import { UnplannedGroup, groupUnplannedLegs } from './transportPlanning/unplannedGroups';
import { UnplannedGroupCard } from './transportPlanning/UnplannedGroupCard';
import { journeyColorForOrdinal } from './transportPlanning/journeyColor';
import { timeLabel } from './transportPlanning/planningTime';

/** A journey whose crew is short of what the vehicle's own requirement asks
 * for. Deliberately the *count* rule only, not the full ranked verdict the
 * backend computes in `checkTripCrew` — this page's job is to show the planner
 * where the holes are before they start placing people, and `lane.issues`
 * still carries the authoritative reason. */
function isCrewShort(lane: TransportPlanningLane): boolean {
  return lane.crewMembers.length < lane.crewRequirement.minimumCrew;
}

/** One number and one word, the shape the readiness strip repeats four times. */
const ReadinessTile = ({
  value,
  label,
  tone = 'default',
  icon,
  testId,
}: {
  value: string;
  label: string;
  tone?: 'default' | 'error';
  icon: React.ReactNode;
  testId: string;
}) => (
  <Paper variant="outlined" data-testid={testId} sx={{ p: 1.5, flex: '1 1 160px', minWidth: 0 }}>
    <Stack direction="row" spacing={1} alignItems="center" sx={{ color: tone === 'error' ? 'error.main' : 'text.secondary' }}>
      {icon}
      <Typography variant="caption" sx={{ minWidth: 0 }}>
        {label}
      </Typography>
    </Stack>
    <Typography variant="h5" sx={{ mt: 0.5, color: tone === 'error' ? 'error.main' : 'text.primary' }}>
      {value}
    </Typography>
  </Paper>
);

/**
 * "Montar o dia" — the construction counterpart to `TransportPlanningPage`.
 *
 * The board is a *verification* view: it shows what is already planned, on a
 * time axis, organised by the vehicles that already have journeys. But that is
 * not the order a planner works in. They start from the people who need rides
 * and the resources that are free, in four questions:
 *
 *   1. what do I have today (which vehicles run, who can crew them)
 *   2. what has to happen (the demand, grouped as it will be decided)
 *   3. match them
 *   4. what is left, and what is broken
 *
 * Question 1 has no home on the board at all — crew is reachable only by
 * opening a dialog on a journey that already exists, so "three of today's
 * vehicles have nobody on them" is invisible until you go looking. This page
 * puts resources first and demand second, and leaves the timeline to do what
 * it is good at: checking the result. No time axis here on purpose — times are
 * text, and "Ver no quadro" is one click away.
 *
 * Built entirely on the API the board already uses (`/trips/board`,
 * `/trips/crew-candidates`, and the existing assign/suggest dialogs); it adds
 * no endpoint of its own.
 */
export const TransportPlanningBuildPage = () => {
  const t = useT();
  const notify = useNotify();
  const [searchParams, setSearchParams] = useSearchParams();
  const date = searchParams.get('date') || toIsoDate(new Date());
  const setDate = useCallback(
    (next: string) => {
      if (!next) return;
      const params = new URLSearchParams(searchParams);
      params.set('date', next);
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const [board, setBoard] = useState<TransportPlanningBoard | null>(null);
  const [crewCandidates, setCrewCandidates] = useState<TripCrewCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [crewTarget, setCrewTarget] = useState<CrewDialogTarget | null>(null);
  const [addVehicleOpen, setAddVehicleOpen] = useState(false);
  const [assignGroupTarget, setAssignGroupTarget] = useState<UnplannedGroup | null>(null);
  const [assignTarget, setAssignTarget] = useState<AssignLegDialogTarget | null>(null);
  const [suggestTarget, setSuggestTarget] = useState<UnplannedGroup | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [boardResult, crewResult] = await Promise.all([
        apiFetch<TransportPlanningBoard>(`/trips/board?date=${date}`),
        apiFetch<TripCrewCandidate[]>(`/trips/crew-candidates?date=${date}`),
      ]);
      setBoard(boardResult);
      setCrewCandidates(crewResult);
    } catch (cause) {
      setLoadError(cause instanceof ApiError ? apiErrorLabel(t, cause) : t('transportPlanning.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [date, t]);

  useEffect(() => {
    load();
  }, [load]);

  // The dialog stays open across an add/remove, so it has to read its lane
  // from the freshly-loaded board rather than the snapshot it was opened with
  // — same reasoning as the board page's own `crewDialogTarget`.
  const crewDialogTarget = useMemo(() => {
    if (!crewTarget || !board) return null;
    const lane = board.lanes.find((candidate) => candidate.trip.id === crewTarget.lane.trip.id);
    return lane ? { ...crewTarget, lane } : null;
  }, [crewTarget, board]);

  const unplannedGroups = useMemo(
    () => (board ? groupUnplannedLegs(board.unassignedLegIds, board.legsById) : []),
    [board],
  );

  /** One entry per vehicle in service today, each with its journeys in the
   * order they run — the same grouping the board draws, minus the geometry. */
  const vehicleDays = useMemo(() => {
    if (!board) return [];
    const byVehicle = new Map<string, { vehicle: TransportPlanningLane['vehicle']; lanes: TransportPlanningLane[] }>();
    for (const lane of board.lanes) {
      const entry = byVehicle.get(lane.vehicle.id) ?? { vehicle: lane.vehicle, lanes: [] };
      entry.lanes.push(lane);
      byVehicle.set(lane.vehicle.id, entry);
    }
    return [...byVehicle.values()].sort((a, b) => a.vehicle.numeroCauda.localeCompare(b.vehicle.numeroCauda));
  }, [board]);

  const stats = useMemo(() => {
    const lanes = board?.lanes ?? [];
    const placedLegIds = new Set(
      lanes.flatMap((lane) => lane.stops.map((stop) => stop.transportLegId).filter((id): id is string => !!id)),
    );
    const unplaced = board?.unassignedLegIds.length ?? 0;
    return {
      unplaced,
      placed: placedLegIds.size,
      total: placedLegIds.size + unplaced,
      vehiclesInService: new Set(lanes.map((lane) => lane.vehicle.id)).size,
      crewShortJourneys: lanes.filter(isCrewShort).length,
      errors: lanes.flatMap((lane) => lane.issues).filter((issue) => issue.level === 'ERROR').length,
      crewFree: crewCandidates.filter((person) => !person.absent && person.crewingTripIds.length === 0).length,
    };
  }, [board, crewCandidates]);

  const handleAddJourney = useCallback(
    async (vehicleId: string) => {
      try {
        await apiFetch('/trips', { method: 'POST', body: { date, vehicleId } });
        load();
      } catch (cause) {
        notify(cause instanceof ApiError ? apiErrorLabel(t, cause) : t('transportPlanning.addVehicleFailed'), {
          type: 'error',
        });
      }
    },
    [date, load, notify, t],
  );

  const placedPercent = stats.total > 0 ? Math.round((stats.placed / stats.total) * 100) : 100;

  return (
    <Box sx={{ minWidth: 0 }}>
      <Title title={t('transportBuild.pageTitle')} />
      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1} sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h5">{t('transportBuild.pageTitle')}</Typography>
          <Typography variant="body2" color="text.secondary">
            {t('transportBuild.pageSubtitle')}
          </Typography>
        </Box>
        <Stack direction="row" alignItems="center" gap={1}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<AltRouteIcon />}
            component={RouterLink}
            to={`/transport-planning?date=${date}`}
          >
            {t('transportBuild.openBoard')}
          </Button>
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
        <>
          <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
            <ReadinessTile
              icon={<GroupsIcon fontSize="small" />}
              label={t('transportBuild.statUnplaced')}
              testId="tile-unplaced"
              value={String(stats.unplaced)}
              tone={stats.unplaced > 0 ? 'error' : 'default'}
            />
            <ReadinessTile
              icon={<DirectionsBusIcon fontSize="small" />}
              label={t('transportBuild.statVehicles')}
              testId="tile-vehicles"
              value={String(stats.vehiclesInService)}
            />
            <ReadinessTile
              icon={<PersonOutlineIcon fontSize="small" />}
              label={t('transportBuild.statCrewShort')}
              testId="tile-crew-short"
              value={String(stats.crewShortJourneys)}
              tone={stats.crewShortJourneys > 0 ? 'error' : 'default'}
            />
            <ReadinessTile
              icon={<ErrorOutlineIcon fontSize="small" />}
              label={t('transportBuild.statConflicts')}
              testId="tile-conflicts"
              value={String(stats.errors)}
              tone={stats.errors > 0 ? 'error' : 'default'}
            />
          </Stack>

          <Box sx={{ mb: 3 }}>
            <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
              <Typography variant="caption" color="text.secondary">
                {t('transportBuild.progressLabel', { placed: stats.placed, total: stats.total })}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {placedPercent}%
              </Typography>
            </Stack>
            <LinearProgress
              variant="determinate"
              value={placedPercent}
              color={stats.unplaced > 0 ? 'primary' : 'success'}
              sx={{ height: 6, borderRadius: 3 }}
            />
          </Box>

          {/* ── Step 1 ─────────────────────────────────────────────────────
              Resources before demand. A vehicle with nobody on it cannot take
              a patient, so a planner who places first and crews afterwards
              finds out at the end of the session that half the day has to be
              redone. */}
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
            {t('transportBuild.step1Title')}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {t('transportBuild.step1Hint', { count: stats.crewFree })}
          </Typography>

          <Stack spacing={1} sx={{ mb: 1.5 }}>
            {vehicleDays.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                {t('transportBuild.noVehicles')}
              </Typography>
            )}
            {vehicleDays.map(({ vehicle, lanes }) => (
              <Paper key={vehicle.id} variant="outlined" sx={{ p: 1.5 }}>
                <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
                  <DirectionsBusIcon fontSize="small" sx={{ color: 'action.active' }} />
                  <Typography variant="subtitle2" fontWeight={700}>
                    {vehicle.numeroCauda}
                  </Typography>
                  <Chip size="small" variant="outlined" label={vehicle.licensePlate} />
                  <Typography variant="caption" color="text.secondary">
                    {t('transportBuild.vehicleCapacity', {
                      seats: vehicle.seatedCapacity,
                      wheelchairs: vehicle.wheelchairPositions,
                      stretchers: vehicle.stretcherPositions,
                    })}
                  </Typography>
                  <Button
                    size="small"
                    startIcon={<AddIcon />}
                    sx={{ ml: 'auto' }}
                    onClick={() => handleAddJourney(vehicle.id)}
                  >
                    {t('transportPlanning.addJourneyButton')}
                  </Button>
                </Stack>

                <Stack divider={<Divider flexItem />} spacing={0.5}>
                  {lanes.map((lane) => {
                    const short = isCrewShort(lane);
                    const crewNames = lane.crewMembers
                      .map((member) => `${member.firstName} ${member.lastName}`.trim())
                      .filter(Boolean);
                    return (
                      <Stack
                        key={lane.trip.id}
                        direction="row"
                        alignItems="center"
                        spacing={1}
                        flexWrap="wrap"
                        useFlexGap
                        sx={{ py: 0.5 }}
                      >
                        <Box
                          sx={{
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            flexShrink: 0,
                            bgcolor: journeyColorForOrdinal(lane.journeyNumber),
                          }}
                        />
                        <Typography variant="body2" sx={{ minWidth: 92 }}>
                          {t('transportPlanning.journeyLabel', { number: lane.journeyNumber })}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ minWidth: 0, flexGrow: 1 }}>
                          {crewNames.length ? crewNames.join(', ') : t('transportPlanning.noCrew')}
                        </Typography>
                        <Tooltip
                          title={t('transportPlanning.crewRequirementHint', {
                            requirement: `${lane.crewRequirement.minimumCrew}× ${CERTIFICATION_LABEL[lane.crewRequirement.minimumCertification]}`,
                          })}
                        >
                          <Chip
                            size="small"
                            color={short ? 'error' : 'default'}
                            variant={short ? 'filled' : 'outlined'}
                            label={`${lane.crewMembers.length}/${lane.crewRequirement.minimumCrew}`}
                          />
                        </Tooltip>
                        <Button
                          size="small"
                          variant={short ? 'contained' : 'text'}
                          disableElevation
                          startIcon={<PersonAddAlt1Icon />}
                          onClick={() => setCrewTarget({ lane, journeyNumber: lane.journeyNumber, date })}
                        >
                          {t('transportBuild.crewButton')}
                        </Button>
                      </Stack>
                    );
                  })}
                </Stack>
              </Paper>
            ))}
            <Box>
              <Button size="small" startIcon={<AddIcon />} onClick={() => setAddVehicleOpen(true)}>
                {t('transportPlanning.addVehicleButton')}
              </Button>
            </Box>
          </Stack>

          {/* ── Step 2 ─────────────────────────────────────────────────────
              The demand, in the unit a decision is actually made in. Same
              grouped card as the board's rail, and the same two dialogs
              behind it — this page changes the order the questions are
              asked, not the answers. */}
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mt: 3, mb: 0.5 }}>
            {t('transportBuild.step2Title')}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {t('transportBuild.step2Hint')}
          </Typography>

          {unplannedGroups.length === 0 ? (
            <Alert severity="success" variant="outlined">
              {t('transportBuild.allPlaced')}
            </Alert>
          ) : (
            <Box
              sx={{
                display: 'grid',
                gap: 1.5,
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' },
              }}
            >
              {unplannedGroups.map((group) => (
                <UnplannedGroupCard
                  key={group.key}
                  group={group}
                  legsById={board.legsById}
                  vehicles={board.lanes.map((lane) => lane.vehicle)}
                  onAssignGroup={() => setAssignGroupTarget(group)}
                  onAssignPerson={(legId) => {
                    const leg = board.legsById[legId];
                    if (leg) setAssignTarget(assignTargetForLeg(legId, leg));
                  }}
                  onSuggestPlacements={() => setSuggestTarget(group)}
                />
              ))}
            </Box>
          )}

          {/* What the day looks like once placed — a sequence, not a gantt.
              Enough to notice "journey 2 ends at 17:40" without leaving. */}
          {vehicleDays.length > 0 && (
            <>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mt: 3, mb: 1.5 }}>
                {t('transportBuild.step3Title')}
              </Typography>
              <Stack spacing={1}>
                {vehicleDays.map(({ vehicle, lanes }) =>
                  lanes.map((lane) => {
                    const passengers = lane.stops
                      .filter((stop) => stop.kind === 'PICKUP' && stop.transportLegId)
                      .map((stop) => board.legsById[stop.transportLegId as string]?.patientName)
                      .filter((name): name is string => !!name);
                    const times = lane.stops.map((stop) => stop.plannedAt).sort();
                    return (
                      <Paper key={lane.trip.id} variant="outlined" sx={{ p: 1.25 }}>
                        <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
                          <Box
                            sx={{
                              width: 10,
                              height: 10,
                              borderRadius: '50%',
                              flexShrink: 0,
                              bgcolor: journeyColorForOrdinal(lane.journeyNumber),
                            }}
                          />
                          <Typography variant="body2" fontWeight={600}>
                            {vehicle.numeroCauda} ·{' '}
                            {t('transportPlanning.journeyLabel', { number: lane.journeyNumber })}
                          </Typography>
                          {times.length > 0 && (
                            <Chip
                              size="small"
                              variant="outlined"
                              label={`${timeLabel(times[0])} – ${timeLabel(times[times.length - 1])}`}
                            />
                          )}
                          <Typography variant="caption" color="text.secondary" sx={{ minWidth: 0 }}>
                            {passengers.length
                              ? passengers.join(', ')
                              : t('transportBuild.journeyEmpty')}
                          </Typography>
                          <Button
                            size="small"
                            sx={{ ml: 'auto' }}
                            component={RouterLink}
                            to={`/transport-planning/journeys/${lane.trip.id}`}
                          >
                            {t('transportBuild.openJourney')}
                          </Button>
                        </Stack>
                      </Paper>
                    );
                  }),
                )}
              </Stack>
            </>
          )}
        </>
      )}

      <CrewDialog
        target={crewDialogTarget}
        onClose={() => setCrewTarget(null)}
        onSaved={() => {
          notify(t('transportPlanning.crewSaved'));
          load();
        }}
      />
      <AddVehicleLaneDialog
        open={addVehicleOpen}
        date={date}
        excludeVehicleIds={board?.lanes.map((lane) => lane.vehicle.id) ?? []}
        onClose={() => setAddVehicleOpen(false)}
        onCreated={() => load()}
      />
      <AssignLegDialog
        target={assignTarget}
        lanes={board?.lanes ?? []}
        onClose={() => setAssignTarget(null)}
        onSaved={() => {
          notify(t('transportPlanning.assigned'));
          load();
        }}
      />
      <AssignGroupDialog
        group={assignGroupTarget}
        lanes={board?.lanes ?? []}
        onClose={() => setAssignGroupTarget(null)}
        onSaved={() => {
          notify(t('transportPlanning.assigned'));
          load();
        }}
      />
      <SuggestPlacementsDialog
        group={suggestTarget}
        date={date}
        onClose={() => setSuggestTarget(null)}
        onSaved={() => {
          notify(t('transportPlanning.assigned'));
          load();
        }}
      />
    </Box>
  );
};
