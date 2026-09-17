import { useNavigate } from 'react-router-dom';
import { Box, Button, Chip, IconButton, Paper, Stack, Tooltip, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import GroupIcon from '@mui/icons-material/Group';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { CERTIFICATION_LABEL, TransportPlanningLane, TransportPlanningLeg, TripStopKind } from '@redinfo/shared';
import { useT } from '../../i18n/useT';
import { journeyColorForOrdinal } from './journeyColor';
import { legFacilityName } from './legFacts';
import { timeLabel } from './planningTime';

const STOP_LABEL_KEY: Record<TripStopKind, string> = {
  [TripStopKind.PICKUP]: 'transportPlanning.inspectorStopPickup',
  [TripStopKind.DROPOFF]: 'transportPlanning.inspectorStopDropoff',
  [TripStopKind.WAIT]: 'transportPlanning.inspectorStopWait',
  [TripStopKind.RETURN_TO_BASE]: 'transportPlanning.inspectorStopReturnToBase',
};

/**
 * The right-hand panel for the journey focus mode selects (#247 stage 2) —
 * metrics, ordered stops, issues and actions for one journey, so selecting
 * it does more than dim the rest of the board. See
 * `docs/plans/planeamento-transportes-redesign.md` §2: "New right-hand
 * inspector shows the selected journey: metrics, ordered stops, issues,
 * actions."
 */
export const JourneyInspector = ({
  lane,
  legsById,
  onClose,
  onEditCrew,
}: {
  lane: TransportPlanningLane;
  legsById: Record<string, TransportPlanningLeg>;
  onClose: () => void;
  onEditCrew: () => void;
}) => {
  const t = useT();
  const navigate = useNavigate();
  const journeyColor = journeyColorForOrdinal(lane.journeyNumber);
  const orderedStops = [...lane.stops].sort((a, b) => new Date(a.plannedAt).getTime() - new Date(b.plannedAt).getTime());
  const errorCount = lane.issues.filter((issue) => issue.level === 'ERROR').length;
  const warningCount = lane.issues.filter((issue) => issue.level === 'WARNING').length;
  const crewNames = lane.crewMembers.map((member) => `${member.firstName} ${member.lastName}`.trim()).filter(Boolean);

  return (
    <Paper variant="outlined" sx={{ p: 2, minWidth: 0 }}>
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
          <Box sx={{ width: 12, height: 12, borderRadius: '50%', flexShrink: 0, bgcolor: journeyColor }} />
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }} noWrap>
            {t('transportPlanning.inspectorTitle', { number: lane.journeyNumber, vehicle: lane.vehicle.numeroCauda })}
          </Typography>
        </Stack>
        <IconButton size="small" aria-label={t('transportPlanning.inspectorClose')} onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Stack>

      <Stack direction="row" spacing={1} sx={{ mt: 1, mb: 1.5 }} flexWrap="wrap" useFlexGap>
        {lane.occupancyWindow && (
          <Chip
            size="small"
            label={`${timeLabel(lane.occupancyWindow.startsAt)} – ${timeLabel(lane.occupancyWindow.endsAt)}`}
          />
        )}
        <Chip size="small" icon={<GroupIcon fontSize="small" />} label={crewNames.length || t('transportPlanning.noCrew')} />
        {errorCount > 0 && (
          <Chip size="small" color="error" icon={<ErrorOutlineIcon fontSize="small" />} label={errorCount} />
        )}
        {warningCount > 0 && (
          <Chip size="small" color="warning" icon={<WarningAmberIcon fontSize="small" />} label={warningCount} />
        )}
      </Stack>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
        {t('transportPlanning.inspectorStopsTitle')}
      </Typography>
      <Stack spacing={0.5} sx={{ mb: 1.5 }}>
        {orderedStops.length === 0 && (
          <Typography variant="body2" color="text.disabled">
            {t('transportPlanning.journeyEmpty')}
          </Typography>
        )}
        {orderedStops.map((stop) => {
          const leg = stop.transportLegId ? legsById[stop.transportLegId] : undefined;
          const facilityName = leg ? legFacilityName(leg) : null;
          return (
            <Stack key={stop.id} direction="row" spacing={1} alignItems="baseline">
              <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums', width: 44, flexShrink: 0 }}>
                {timeLabel(stop.plannedAt)}
              </Typography>
              <Typography variant="body2" sx={{ minWidth: 0 }} noWrap>
                {t(STOP_LABEL_KEY[stop.kind])}
                {leg?.patientName ? ` — ${leg.patientName}` : ''}
                {facilityName ? ` (${facilityName})` : ''}
              </Typography>
            </Stack>
          );
        })}
      </Stack>

      {lane.issues.length > 0 && (
        <>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            {t('transportPlanning.issuesTitle')}
          </Typography>
          <Stack spacing={0.25} sx={{ mb: 1.5 }}>
            {lane.issues.map((issue, index) => (
              <Typography key={index} variant="body2" color={issue.level === 'ERROR' ? 'error.main' : 'text.secondary'}>
                {issue.message}
              </Typography>
            ))}
          </Stack>
        </>
      )}

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Tooltip title={t('transportPlanning.crewRequirementHint', { requirement: `${lane.crewRequirement.minimumCrew}× ${CERTIFICATION_LABEL[lane.crewRequirement.minimumCertification]}` })}>
          <Button size="small" onClick={onEditCrew}>
            {t('transportPlanning.inspectorEditCrew')}
          </Button>
        </Tooltip>
        <Button
          size="small"
          variant="outlined"
          endIcon={<OpenInNewIcon fontSize="small" />}
          onClick={() => navigate(`/transport-planning/journeys/${lane.trip.id}`)}
        >
          {t('transportPlanning.inspectorOpenJourney')}
        </Button>
      </Stack>
    </Paper>
  );
};
