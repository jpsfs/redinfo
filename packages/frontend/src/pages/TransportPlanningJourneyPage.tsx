import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Title, useNotify } from 'react-admin';
import { Alert, Box, Button, Chip, CircularProgress, Paper, Stack, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import GroupIcon from '@mui/icons-material/Group';
import PrintIcon from '@mui/icons-material/Print';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { CERTIFICATION_LABEL, TripJourneyDetail } from '@redinfo/shared';
import { apiFetch, ApiError } from '../api';
import { apiErrorLabel } from '../i18n/labels';
import { useT } from '../i18n/useT';
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
 * One journey's own page and printable crew sheet (#247 stage 3) —
 * `/transport-planning/journeys/:tripId`, reached from the board (the
 * inspector's "Open journey" action) or bookmarked directly. `GET
 * /trips/:id` now serves everything it needs (`TripJourneyDetail`): the
 * vehicle, this journey's own `legsById` and its ranked issues, the same
 * data the board computes for the lane.
 *
 * Live and print in one screen, `myTransportTrips.css`'s own precedent
 * (see that page's doc comment) rather than a server-generated PDF — the
 * crew sheet is exactly what's already on screen, minus the app chrome.
 */
export const TransportPlanningJourneyPage = () => {
  const { tripId } = useParams<{ tripId: string }>();
  const navigate = useNavigate();
  const t = useT();
  const notify = useNotify();
  const [journey, setJourney] = useState<TripJourneyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [crewTarget, setCrewTarget] = useState<CrewDialogTarget | null>(null);
  const [waitReleaseTarget, setWaitReleaseTarget] = useState<WaitReleaseTarget | null>(null);
  // The map column's own collapse (#247 stage 5) — same reasoning as the
  // board's `railCollapsed`: a planner reading the stop table wants it
  // wider more often than they want the map open.
  const [mapCollapsed, setMapCollapsed] = useState(false);

  const load = useCallback(async () => {
    if (!tripId) return;
    setLoading(true);
    setLoadError(null);
    try {
      setJourney(await apiFetch<TripJourneyDetail>(`/trips/${tripId}`));
    } catch (cause) {
      setLoadError(cause instanceof ApiError ? apiErrorLabel(t, cause) : t('transportJourney.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [tripId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const errorCount = journey?.issues.filter((issue) => issue.level === 'ERROR').length ?? 0;
  const warningCount = journey?.issues.filter((issue) => issue.level === 'WARNING').length ?? 0;
  const crewNames = journey?.crewMembers.map((member) => `${member.firstName} ${member.lastName}`.trim()).filter(Boolean) ?? [];

  // A single-lane `board` — `MapPanel` already expects exactly this shape
  // for the multi-journey planning board, and a `TripJourneyDetail` extends
  // `TransportPlanningLane`, so no adapter is needed beyond wrapping it in a
  // one-element array. `selectedTripId` is this journey's own id from the
  // start: there is nothing else on this map to focus away from, so the
  // only effect is the one this page actually wants — fit the view to it.
  const journeyBoard = useMemo(
    () => (journey ? { lanes: [journey], legsById: journey.legsById, unassignedLegIds: [] } : null),
    [journey],
  );

  // The same aggregated summary the vehicle-day page shows, computed over
  // this one journey (#247 stage 5) — see `summarizeJourneys`'s own doc
  // comment for why this is the same function rather than a bespoke
  // single-journey calculation that could drift from the aggregate one.
  const summary = useMemo(() => (journey ? summarizeJourneys([journey], journey.legsById) : null), [journey]);

  const destinations = useMemo(
    () => (journey ? journeyDestinations(Object.values(journey.legsById)) : []),
    [journey],
  );

  const summaryBadges: JourneySummaryBadge[] = useMemo(() => {
    if (!journey || !summary) return [];
    const badges: JourneySummaryBadge[] = [
      { key: 'status', label: t(`tripStatus.${journey.trip.status}`), variant: 'outlined' },
    ];
    if (summary.roundTrip) badges.push({ key: 'roundTrip', label: t('transportJourney.roundTripBadge') });
    badges.push(
      summary.crewComplete
        ? { key: 'crew', label: t('transportJourney.crewCompleteBadge'), color: 'success' }
        : { key: 'crew', label: t('transportJourney.crewIncompleteBadge'), color: 'error' },
    );
    return badges;
  }, [journey, summary, t]);

  return (
    <Box sx={{ minWidth: 0 }}>
      <Title
        title={journey ? t('transportJourney.pageTitle', { number: journey.journeyNumber }) : t('transportJourney.pageTitleLoading')}
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
        {journey && (
          <Button startIcon={<PrintIcon />} onClick={() => window.print()}>
            {t('transportJourney.printButton')}
          </Button>
        )}
      </Stack>

      {loadError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {loadError}
        </Alert>
      )}
      {loading && <CircularProgress />}

      {!loading && journey && (
        <Paper variant="outlined" className="journey-page-sheet" sx={{ p: 2 }}>
          {summary && (
            <JourneySummaryHeader
              colorDot={journeyColorForOrdinal(journey.journeyNumber)}
              title={
                destinations.length
                  ? `${journey.vehicle.numeroCauda} · ${t('transportJourney.pageTitle', { number: journey.journeyNumber })} — ${destinations.join(' / ')}`
                  : `${journey.vehicle.numeroCauda} · ${t('transportJourney.pageTitle', { number: journey.journeyNumber })}`
              }
              vehicleLabel={journey.vehicle.licensePlate}
              badges={summaryBadges}
              summary={summary}
            />
          )}

          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t('transportJourney.dateLabel')} {journey.trip.date}
          </Typography>

          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
            <Chip icon={<GroupIcon fontSize="small" />} label={crewNames.length ? crewNames.join(', ') : t('transportPlanning.noCrew')} />
            <Chip
              variant="outlined"
              label={`${journey.crewRequirement.minimumCrew}× ${CERTIFICATION_LABEL[journey.crewRequirement.minimumCertification]}`}
            />
            {errorCount > 0 && (
              <Chip color="error" icon={<ErrorOutlineIcon fontSize="small" />} label={errorCount} />
            )}
            {warningCount > 0 && (
              <Chip color="warning" icon={<WarningAmberIcon fontSize="small" />} label={warningCount} />
            )}
            <Button
              size="small"
              className="journey-page-toolbar"
              onClick={() => setCrewTarget({ lane: journey, journeyNumber: journey.journeyNumber, date: journey.trip.date })}
            >
              {t('transportPlanning.inspectorEditCrew')}
            </Button>
          </Stack>

          <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} sx={{ alignItems: 'flex-start' }}>
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Typography variant="subtitle1" sx={{ mb: 1 }}>
                {t('transportJourney.stopsTitle')}
              </Typography>
              <JourneyStopTable
                stops={journey.stops}
                legsById={journey.legsById}
                onDecideWaitRelease={(dropoffStop) =>
                  setWaitReleaseTarget({
                    tripId: journey.trip.id,
                    dropoffStopId: dropoffStop.id,
                    facilityId: dropoffStop.facilityId,
                    plannedAt: dropoffStop.plannedAt,
                  })
                }
              />

              {journey.issues.length > 0 && (
                <>
                  <Typography variant="subtitle1" sx={{ mt: 2, mb: 1 }}>
                    {t('transportPlanning.issuesTitle')}
                  </Typography>
                  <Stack spacing={0.5}>
                    {journey.issues.map((issue, index) => (
                      <Stack key={index} direction="row" spacing={1} alignItems="center">
                        {issue.level === 'ERROR' ? (
                          <ErrorOutlineIcon fontSize="small" color="error" />
                        ) : (
                          <WarningAmberIcon fontSize="small" color="warning" />
                        )}
                        <Typography variant="body2">{issue.message}</Typography>
                      </Stack>
                    ))}
                  </Stack>
                </>
              )}
            </Box>

            {/* Never printed — the crew sheet's own precedent
                (`journeyPage.css`) is a paper artefact, and a WebGL canvas
                has nothing to hand it. */}
            <CollapsibleMapColumn collapsed={mapCollapsed} onToggle={() => setMapCollapsed((collapsed) => !collapsed)}>
              {journeyBoard && (
                <MapPanel board={journeyBoard} selectedTripId={journey.trip.id} onSelectTrip={() => {}} />
              )}
            </CollapsibleMapColumn>
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
