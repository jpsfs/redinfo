import { Alert, Button, Chip, Paper, Stack, Typography } from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import GroupsIcon from '@mui/icons-material/Groups';
import PlaceIcon from '@mui/icons-material/Place';
import TipsAndUpdatesIcon from '@mui/icons-material/TipsAndUpdates';
import { LegDirection, TransportPlanningLane, TransportPlanningLeg } from '@redinfo/shared';
import { useT } from '../../i18n/useT';
import { MobilityChip } from '../../resources/patients/patientChips';
import { groupDemand, groupFeasibility, UnplannedGroup } from './unplannedGroups';
import { timeLabel } from './planningTime';

/**
 * The unplanned rail's grouped card (#247 stage 2) — one destination, one
 * direction, one ±15-minute arrival window, the people inside it listed
 * (name, mobility) because that's what decides whether the group fits a
 * vehicle at all. Assignable whole, via a dialog (`onAssignGroup`) rather
 * than a drag — see `docs/plans/planeamento-transportes-redesign.md` §3 and
 * §8, "assignable whole (one drag, one suggestion, one dialog)". Opened out
 * to one row per person with the "per pessoa" toggle, which is
 * `TransportPlanningPage`'s to render, not this card's.
 */
export const UnplannedGroupCard = ({
  group,
  legsById,
  vehicles,
  onAssignGroup,
  onAssignPerson,
  onSuggestPlacements,
}: {
  group: UnplannedGroup;
  legsById: Record<string, TransportPlanningLeg>;
  vehicles: TransportPlanningLane['vehicle'][];
  onAssignGroup: () => void;
  onAssignPerson: (legId: string) => void;
  onSuggestPlacements: () => void;
}) => {
  const t = useT();
  const isOutbound = group.direction === LegDirection.OUTBOUND;
  const demand = groupDemand(group, legsById);
  const feasibility = groupFeasibility(demand, vehicles);
  const people = group.legIds.map((legId) => legsById[legId]).filter((leg): leg is TransportPlanningLeg => !!leg);

  return (
    <Paper variant="outlined" sx={{ p: 1 }}>
      <Stack spacing={0.75}>
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
            color={group.facilityName ? 'text.primary' : 'text.disabled'}
            title={group.facilityName ?? undefined}
            sx={{ minWidth: 0 }}
          >
            {group.facilityName ?? t('transportPlanning.destinationUnknown')}
          </Typography>
          <Chip size="small" label={timeLabel(group.arrivalInstant)} sx={{ ml: 'auto', flexShrink: 0 }} />
        </Stack>

        <Stack direction="row" spacing={0.5} alignItems="center" color="text.secondary">
          <GroupsIcon fontSize="small" />
          <Typography variant="caption">{t('transportPlanning.groupSize', { count: people.length })}</Typography>
        </Stack>

        <Stack spacing={0.5} sx={{ borderTop: 1, borderColor: 'divider', pt: 0.5 }}>
          {people.map((leg) => (
            <Stack key={leg.id} direction="row" spacing={0.5} alignItems="center" sx={{ minWidth: 0 }}>
              <Typography variant="body2" noWrap title={leg.patientName ?? undefined} sx={{ flexGrow: 1, minWidth: 0 }}>
                {leg.patientName ?? t(`transportLeg.direction.${leg.direction}`)}
              </Typography>
              <MobilityChip value={leg.patientMobility} />
              {/* No `Tooltip` here on purpose — it would inject an
                  `aria-label` that overrides this button's own visible text
                  as its accessible name, so it would stop reading as
                  "Assign" like the flat card's identical button does. */}
              <Button size="small" onClick={() => onAssignPerson(leg.id)} sx={{ minWidth: 0, px: 0.75 }}>
                {t('transportPlanning.assignButton')}
              </Button>
            </Stack>
          ))}
        </Stack>

        {!feasibility.fits && (
          <Alert severity="error" variant="outlined" sx={{ py: 0 }}>
            {t(`transportPlanning.groupInfeasible.${feasibility.reason}`)}
          </Alert>
        )}

        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Button size="small" variant="outlined" startIcon={<GroupsIcon />} onClick={onAssignGroup}>
            {t('transportPlanning.assignGroupButton')}
          </Button>
          <Button size="small" variant="outlined" startIcon={<TipsAndUpdatesIcon />} onClick={onSuggestPlacements}>
            {t('transportPlanning.suggestPlacementsButton')}
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
};
