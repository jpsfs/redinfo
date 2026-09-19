import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Title, useNotify } from 'react-admin';
import { Alert, Box, Button, Chip, CircularProgress, Divider, Paper, Stack, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { VehicleDayJourneys } from '@redinfo/shared';
import { apiFetch, ApiError } from '../api';
import { apiErrorLabel } from '../i18n/labels';
import { useT } from '../i18n/useT';
import { toIsoDate } from '../utils/dates';
import { CrewDialog, CrewDialogTarget } from './transportPlanning/CrewDialog';
import { journeyColorForOrdinal } from './transportPlanning/journeyColor';
import { journeyDestinations } from './transportPlanning/legFacts';
import { CollapsibleMapColumn } from './transportPlanning/journey/CollapsibleMapColumn';
import { JourneyStopTable } from './transportPlanning/journey/JourneyStopTable';
import { JourneySummaryBadge, JourneySummaryHeader } from './transportPlanning/journey/JourneySummaryHeader';
import { summarizeJourneys } from './transportPlanning/journey/journeySummary';
import { MapPanel } from './transportPlanning/map/MapPanel';
import { WaitReleaseDialog, WaitReleaseTarget } from './transportPlanning/WaitReleaseDialog';
import './transportPlanning/journey/journeyPage.css';

/**
 * One vehicle's whole day (#247 stage 5) —
 * `/transport-planning/vehicle/:vehicleId?date=`, reached from the board by
 * clicking a vehicle's own icon. No separate drawer entry, same as
 * `TransportPlanningJourneyPage` — a vehicle's day is a detail view of a
 * record already reachable from the board, not a screen of its own.
 *
 * Shaped like the single-journey page stacked N times — each journey block
 * gets its own stop table *and* its own collapsible map, collapsed
 * independently of its neighbours, the same `CollapsibleMapColumn` +
 * `MapPanel` pairing the standalone journey page uses for its one lane —
 * plus one thing the single-journey page doesn't need on its own: the
 * aggregated summary row (`JourneySummaryHeader`, fed by `summarizeJourneys`)
 * rolled up across every journey the vehicle runs that day, rather than just
 * the one.
 */
export const TransportPlanningVehiclePage = () => {
  const { vehicleId } = useParams<{ vehicleId: string }>();
  const [searchParams] = useSearchParams();
  const date = searchParams.get('date') ?? toIsoDate(new Date());
  const navigate = useNavigate();
  const t = useT();
  const notify = useNotify();
  const [day, setDay] = useState<VehicleDayJourneys | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [crewTarget, setCrewTarget] = useState<CrewDialogTarget | null>(null);
  const [waitReleaseTarget, setWaitReleaseTarget] = useState<WaitReleaseTarget | null>(null);
  // Each journey collapses its own map independently — a `Set` of collapsed
  // trip ids rather than one page-wide flag, since a planner reading
  // journey 3's stops has no reason to also lose journey 1's map.
  const [collapsedMapTripIds, setCollapsedMapTripIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!vehicleId) return;
    setLoading(true);
    setLoadError(null);
    try {
      setDay(await apiFetch<VehicleDayJourneys>(`/trips/vehicle/${vehicleId}?date=${date}`));
    } catch (cause) {
      setLoadError(cause instanceof ApiError ? apiErrorLabel(t, cause) : t('transportVehicleDay.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [vehicleId, date, t]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleMapCollapsed = useCallback((tripId: string) => {
    setCollapsedMapTripIds((current) => {
      const next = new Set(current);
      if (next.has(tripId)) next.delete(tripId);
      else next.add(tripId);
      return next;
    });
  }, []);

  const orderedLanes = useMemo(
    () => (day ? [...day.lanes].sort((a, b) => a.journeyNumber - b.journeyNumber) : []),
    [day],
  );

  // Aggregated over every one of this vehicle's journeys — the same function
  // the single-journey page calls with a one-element array, so the two pages
  // can never compute this differently for the same underlying data.
  const summary = useMemo(() => (day ? summarizeJourneys(day.lanes, day.legsById) : null), [day]);

  const summaryBadges: JourneySummaryBadge[] = useMemo(() => {
    if (!day || !summary) return [];
    return [
      { key: 'journeys', label: t('transportVehicleDay.journeysCount', { count: day.lanes.length }), variant: 'outlined' },
      summary.crewComplete
        ? { key: 'crew', label: t('transportJourney.crewCompleteBadge'), color: 'success' }
        : { key: 'crew', label: t('transportJourney.crewIncompleteBadge'), color: 'error' },
    ];
  }, [day, summary, t]);

  return (
    <Box sx={{ minWidth: 0 }}>
      <Title
        title={
          day
            ? `${day.vehicle.numeroCauda} · ${t('transportVehicleDay.pageTitle')}`
            : t('transportVehicleDay.pageTitleLoading')
        }
      />

      <Stack
        className="journey-page-toolbar"
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        flexWrap="wrap"
        gap={1}
        sx={{ mb: 2 }}
      >
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/transport-planning')}>
          {t('transportJourney.backToBoard')}
        </Button>
      </Stack>

      {loadError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {loadError}
        </Alert>
      )}
      {loading && <CircularProgress />}

      {!loading && day && (
        <Paper variant="outlined" className="journey-page-sheet" sx={{ p: 2 }}>
          {summary && (
            <JourneySummaryHeader
              colorDot={journeyColorForOrdinal(1)}
              title={`${day.vehicle.numeroCauda} · ${t('transportVehicleDay.pageTitle')}`}
              vehicleLabel={day.vehicle.licensePlate}
              badges={summaryBadges}
              summary={summary}
            />
          )}

          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t('transportJourney.dateLabel')} {day.date}
          </Typography>

          <Typography variant="subtitle1" sx={{ mb: 1 }}>
            {t('transportVehicleDay.journeysTitle')}
          </Typography>

          {orderedLanes.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              {t('transportVehicleDay.noJourneys')}
            </Typography>
          )}

          <Stack spacing={2}>
            {orderedLanes.map((lane, index) => {
              const destinations = journeyDestinations(
                lane.stops.map((stop) => (stop.transportLegId ? day.legsById[stop.transportLegId] : undefined)),
              );
              const journeyTitle = destinations.length
                ? `${t('transportJourney.pageTitle', { number: lane.journeyNumber })} — ${destinations.join(' / ')}`
                : t('transportJourney.pageTitle', { number: lane.journeyNumber });
              // A single-lane `board` — see `TransportPlanningJourneyPage`'s
              // own `journeyBoard`, the same shape for the same reason: this
              // journey's map shows only its own route, never its siblings'.
              const journeyBoard = { lanes: [lane], legsById: day.legsById, unassignedLegIds: [] };

              return (
                <Box key={lane.trip.id}>
                  {index > 0 && <Divider sx={{ mb: 2 }} />}
                  <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
                    <Box
                      sx={{
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        flexShrink: 0,
                        bgcolor: journeyColorForOrdinal(lane.journeyNumber),
                      }}
                    />
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                      {journeyTitle}
                    </Typography>
                    <Chip size="small" label={t(`tripStatus.${lane.trip.status}`)} variant="outlined" />
                  </Stack>

                  <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                    <Button
                      size="small"
                      startIcon={<OpenInNewIcon fontSize="small" />}
                      onClick={() => navigate(`/transport-planning/journeys/${lane.trip.id}`)}
                    >
                      {t('transportVehicleDay.openJourney')}
                    </Button>
                    <Button
                      size="small"
                      onClick={() => setCrewTarget({ lane, journeyNumber: lane.journeyNumber, date: lane.trip.date })}
                    >
                      {t('transportPlanning.inspectorEditCrew')}
                    </Button>
                  </Stack>

                  <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} sx={{ alignItems: 'flex-start' }}>
                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                      <JourneyStopTable
                        stops={lane.stops}
                        legsById={day.legsById}
                        onDecideWaitRelease={(dropoffStop) =>
                          setWaitReleaseTarget({
                            tripId: lane.trip.id,
                            dropoffStopId: dropoffStop.id,
                            facilityId: dropoffStop.facilityId,
                            plannedAt: dropoffStop.plannedAt,
                          })
                        }
                      />

                      {lane.issues.length > 0 && (
                        <Stack spacing={0.5} sx={{ mt: 1 }}>
                          {lane.issues.map((issue, issueIndex) => (
                            <Stack key={issueIndex} direction="row" spacing={1} alignItems="center">
                              {issue.level === 'ERROR' ? (
                                <ErrorOutlineIcon fontSize="small" color="error" />
                              ) : (
                                <WarningAmberIcon fontSize="small" color="warning" />
                              )}
                              <Typography variant="body2">{issue.message}</Typography>
                            </Stack>
                          ))}
                        </Stack>
                      )}
                    </Box>

                    <CollapsibleMapColumn
                      collapsed={collapsedMapTripIds.has(lane.trip.id)}
                      onToggle={() => toggleMapCollapsed(lane.trip.id)}
                    >
                      <MapPanel board={journeyBoard} selectedTripId={lane.trip.id} onSelectTrip={() => {}} />
                    </CollapsibleMapColumn>
                  </Stack>
                </Box>
              );
            })}
          </Stack>
        </Paper>
      )}

      <CrewDialog
        target={crewTarget}
        onClose={() => setCrewTarget(null)}
        onSaved={() => {
          notify(t('transportPlanning.crewSaved'));
          setCrewTarget(null);
          load();
        }}
      />
      <WaitReleaseDialog
        target={waitReleaseTarget}
        onClose={() => setWaitReleaseTarget(null)}
        onSaved={() => {
          notify(t('transportPlanning.waitReleaseSaved'));
          setWaitReleaseTarget(null);
          load();
        }}
      />
    </Box>
  );
};
