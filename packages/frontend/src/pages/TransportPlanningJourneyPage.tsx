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
import { JourneyStopTable } from './transportPlanning/journey/JourneyStopTable';
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
          <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
            <Box
              sx={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                flexShrink: 0,
                bgcolor: journeyColorForOrdinal(journey.journeyNumber),
              }}
            />
            <Typography variant="h5">
              {t('transportJourney.pageTitle', { number: journey.journeyNumber })}
            </Typography>
            <Chip label={`${journey.vehicle.numeroCauda} · ${journey.vehicle.licensePlate}`} />
            <Chip label={t(`tripStatus.${journey.trip.status}`)} variant="outlined" />
          </Stack>

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
            <Box className="journey-page-map" sx={{ width: { xs: '100%', lg: 340 }, flexShrink: 0, minWidth: 0 }}>
              <Typography variant="subtitle1" sx={{ mb: 1 }}>
                {t('transportJourney.mapTitle')}
              </Typography>
              {journeyBoard && (
                <MapPanel board={journeyBoard} selectedTripId={journey.trip.id} onSelectTrip={() => {}} />
              )}
            </Box>
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
