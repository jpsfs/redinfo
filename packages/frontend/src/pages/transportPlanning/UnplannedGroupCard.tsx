import { Button, Chip, IconButton, Paper, Stack, Tooltip, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import GroupsIcon from '@mui/icons-material/Groups';
import PlaceIcon from '@mui/icons-material/Place';
import TipsAndUpdatesIcon from '@mui/icons-material/TipsAndUpdates';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { LegDirection, TransportPlanningLane, TransportPlanningLeg } from '@redinfo/shared';
import { useT } from '../../i18n/useT';
import { MOBILITY_ICON } from './mobilityIcon';
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
 *
 * Laid out so the **patient's name gets a whole line**. The first cut put the
 * name, a spelled-out mobility chip and a text button on one 280px row, which
 * truncated real names to about ten characters ("Custódio …") — the one piece
 * of information on the card a planner cannot work without. Mobility is now an
 * icon, the per-person action an icon button, and the two group actions are
 * ranked (filled primary + icon) rather than two identical outlined buttons.
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
    <Paper variant="outlined" sx={{ p: 1.25 }}>
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
          <Typography variant="caption">{t('transportPlanning.groupSize', { smart_count: people.length })}</Typography>
        </Stack>

        <Stack sx={{ borderTop: 1, borderColor: 'divider', pt: 0.25 }}>
          {people.map((leg) => {
            const MobilityIcon = MOBILITY_ICON[leg.patientMobility];
            const name = leg.patientName ?? t(`transportLeg.direction.${leg.direction}`);
            return (
              <Stack key={leg.id} direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0, py: 0.25 }}>
                {/* Mobility as an icon, not a spelled-out chip: it is the
                    single thing that made the name unreadable, and it is
                    already a shape everywhere else on the board. */}
                <Tooltip title={t(`patientMobility.${leg.patientMobility}`)}>
                  <MobilityIcon fontSize="small" sx={{ color: 'text.secondary', flexShrink: 0 }} />
                </Tooltip>
                <Typography variant="body2" noWrap title={name} sx={{ flexGrow: 1, minWidth: 0 }}>
                  {name}
                </Typography>
                {/* Named for the person rather than a bare "Assign": with
                    three people in a card, three buttons all called the same
                    thing is a screen reader dead end. */}
                <Tooltip title={t('transportPlanning.assignPersonAction', { name })}>
                  <IconButton
                    size="small"
                    aria-label={t('transportPlanning.assignPersonAction', { name })}
                    onClick={() => onAssignPerson(leg.id)}
                    sx={{ flexShrink: 0 }}
                  >
                    <AddIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            );
          })}
        </Stack>

        {/* One short line, not a boxed Alert. On a real day this same verdict
            repeats on most cards in the rail, and four stacked red boxes
            spends the "red means a problem" budget the design doc reserves
            without telling the planner anything the first one didn't. */}
        {!feasibility.fits && (
          <Tooltip title={t(`transportPlanning.groupInfeasible.${feasibility.reason}`)}>
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: 'error.main', minWidth: 0 }}>
              <WarningAmberIcon sx={{ fontSize: 16, flexShrink: 0 }} />
              <Typography variant="caption" fontWeight={600} noWrap sx={{ minWidth: 0 }}>
                {t(`transportPlanning.groupInfeasibleShort.${feasibility.reason}`)}
              </Typography>
            </Stack>
          </Tooltip>
        )}

        <Stack direction="row" spacing={0.75} alignItems="center">
          <Button size="small" variant="contained" disableElevation onClick={onAssignGroup} sx={{ flexGrow: 1 }}>
            {t('transportPlanning.assignGroupButton')}
          </Button>
          <Tooltip title={t('transportPlanning.suggestPlacementsButton')}>
            <IconButton
              size="small"
              aria-label={t('transportPlanning.suggestPlacementsButton')}
              onClick={onSuggestPlacements}
              sx={{ flexShrink: 0, border: 1, borderColor: 'divider', borderRadius: 1 }}
            >
              <TipsAndUpdatesIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>
    </Paper>
  );
};
