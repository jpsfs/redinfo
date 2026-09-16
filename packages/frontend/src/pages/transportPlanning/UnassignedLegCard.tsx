import { Box, Button, Chip, Paper, Stack, Tooltip, Typography } from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import PlaceIcon from '@mui/icons-material/Place';
import { LegDirection, TransportPlanningLeg } from '@redinfo/shared';
import { useT } from '../../i18n/useT';
import { MobilityChip } from '../../resources/patients/patientChips';
import { effectiveLegTimes, legFacilityName, treatmentMinutes } from './legFacts';
import { durationLabel, timeLabel } from './planningTime';

/** One labelled time, in tabular figures so a column of them lines up. */
const TimeRow = ({
  label,
  time,
  emphasis,
  hint,
}: {
  label: string;
  time: string | null;
  emphasis?: boolean;
  hint?: string;
}) => {
  const t = useT();
  return (
    <Stack direction="row" spacing={1} alignItems="baseline" justifyContent="space-between">
      <Typography variant="caption" color="text.secondary" noWrap>
        {label}
      </Typography>
      <Typography
        variant="caption"
        fontWeight={emphasis ? 700 : 500}
        color={time ? 'text.primary' : 'text.disabled'}
        sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}
      >
        {time ? timeLabel(time) : '—'}
        {time && hint ? ` (${hint})` : ''}
      </Typography>
    </Stack>
  );
};

/**
 * A leg waiting to be planned (#235's left rail).
 *
 * Ordered by what the planner decides with, not by what the referral happens to
 * carry: the destination first (it decides which legs can share a journey),
 * then the collection time, then the two times the referral actually states —
 * H.I., the appointment that must not be missed, and H.F., when the patient is
 * expected to be ready again.
 *
 * The collection time is the one the crew works out from experience today. When
 * the leg is unplanned it is the board's own suggestion and is marked as such,
 * because a suggested time presented as a commitment is worse than no time.
 */
export const UnassignedLegCard = ({
  leg,
  onAssign,
  onDragStart,
  onDragEnd,
}: {
  leg: TransportPlanningLeg;
  onAssign: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) => {
  const t = useT();
  const isOutbound = leg.direction === LegDirection.OUTBOUND;
  const facilityName = legFacilityName(leg);
  const treatment = treatmentMinutes(leg);
  const { pickupAt, dropoffAt, isSuggested } = effectiveLegTimes(leg);

  return (
    <Paper
      variant="outlined"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/json', JSON.stringify({ legId: leg.id }));
        e.dataTransfer.effectAllowed = 'move';
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      sx={{
        p: 1,
        cursor: 'grab',
        '&:active': { cursor: 'grabbing' },
        '&:hover': { borderColor: 'primary.main', boxShadow: 1 },
        transition: 'border-color 120ms, box-shadow 120ms',
      }}
    >
      <Stack spacing={0.75}>
        <Stack direction="row" spacing={0.5} alignItems="flex-start" justifyContent="space-between">
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ minWidth: 0 }}>
            <DragIndicatorIcon fontSize="small" sx={{ color: 'action.disabled', flexShrink: 0 }} />
            <Typography variant="body2" fontWeight={600} noWrap title={leg.patientName ?? undefined}>
              {leg.patientName ?? t(`transportLeg.direction.${leg.direction}`)}
            </Typography>
          </Stack>
          {leg.arrivalWindowWarning && (
            <Tooltip title={t(`transportPlanning.arrivalWarning.${leg.arrivalWindowWarning}`)}>
              <ErrorOutlineIcon fontSize="small" color="warning" sx={{ flexShrink: 0 }} />
            </Tooltip>
          )}
        </Stack>

        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ minWidth: 0 }}>
          {isOutbound ? (
            <ArrowForwardIcon fontSize="small" sx={{ color: 'primary.main', flexShrink: 0 }} />
          ) : (
            <ArrowBackIcon fontSize="small" sx={{ color: 'secondary.main', flexShrink: 0 }} />
          )}
          <PlaceIcon fontSize="small" sx={{ color: 'action.active', flexShrink: 0 }} />
          <Typography
            variant="body2"
            fontWeight={600}
            noWrap
            color={facilityName ? 'text.primary' : 'text.disabled'}
            title={facilityName ?? undefined}
          >
            {facilityName ?? t('transportPlanning.destinationUnknown')}
          </Typography>
        </Stack>

        <Box sx={{ borderTop: 1, borderColor: 'divider', pt: 0.5 }}>
          {isOutbound ? (
            <>
              <TimeRow
                label={t('transportPlanning.pickupLabel')}
                time={pickupAt}
                emphasis
                hint={isSuggested ? t('transportPlanning.suggestedHint') : undefined}
              />
              <TimeRow label={t('transportPlanning.treatmentStartShort')} time={leg.appointmentAt} emphasis />
              <TimeRow label={t('transportPlanning.treatmentEndShort')} time={leg.effectiveEstimatedEndAt} />
            </>
          ) : (
            <>
              <TimeRow
                label={t('transportPlanning.pickupLabel')}
                time={pickupAt}
                emphasis
                hint={isSuggested ? t('transportPlanning.suggestedHint') : undefined}
              />
              <TimeRow
                label={t('transportPlanning.homeArrivalLabel')}
                time={dropoffAt}
                hint={isSuggested ? t('transportPlanning.suggestedHint') : undefined}
              />
            </>
          )}
        </Box>

        <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
          <MobilityChip value={leg.patientMobility} />
          {leg.travelMinutes != null ? (
            <Tooltip title={leg.travelEstimated ? t('transportPlanning.travelEstimatedHint') : ''}>
              <Chip
                size="small"
                variant="outlined"
                label={`${t('transportPlanning.travelLabel')} ${durationLabel(leg.travelMinutes)}${
                  leg.travelEstimated ? ' ~' : ''
                }`}
              />
            </Tooltip>
          ) : (
            <Tooltip title={t('transportPlanning.travelUnknown')}>
              <Chip size="small" variant="outlined" color="warning" label={`${t('transportPlanning.travelLabel')} —`} />
            </Tooltip>
          )}
          {treatment != null && (
            <Chip
              size="small"
              variant="outlined"
              label={`${t('transportPlanning.treatmentDurationLabel')} ${durationLabel(treatment)}`}
            />
          )}
        </Stack>

        <Button size="small" onClick={onAssign} sx={{ alignSelf: 'flex-start' }}>
          {t('transportPlanning.assignButton')}
        </Button>
      </Stack>
    </Paper>
  );
};
