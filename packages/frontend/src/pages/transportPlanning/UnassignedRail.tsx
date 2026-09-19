import { IconButton, Stack, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import { TransportPlanningBoard } from '@redinfo/shared';
import { useT } from '../../i18n/useT';
import { UnassignedLegCard } from './UnassignedLegCard';
import { UnplannedGroup } from './unplannedGroups';
import { UnplannedGroupCard } from './UnplannedGroupCard';

/** The docked rail's width. 280 was not enough for a real Portuguese name
 * once the card also had to carry a mobility marker and an action. */
export const UNASSIGNED_RAIL_WIDTH = 330;

/**
 * The board's unassigned work — grouped by destination and arrival window by
 * default, flat "per person" behind the toggle (#247 stage 2).
 *
 * Extracted from `TransportPlanningPage` when the rail stopped having exactly
 * one home: it is docked beside the board, and it is *also* what the "Por
 * atribuir" toolbar button opens in a drawer once the planner has hidden it.
 * Two call sites, one list — the alternative was duplicating the grouped and
 * per-person branches and letting them drift.
 */
export const UnassignedRail = ({
  board,
  unplannedGroups,
  perPersonView,
  onPerPersonViewChange,
  onDragStart,
  onDragEnd,
  onAssignLeg,
  onAssignGroup,
  onSuggestPlacements,
  onHide,
  onDock,
}: {
  board: TransportPlanningBoard;
  unplannedGroups: UnplannedGroup[];
  perPersonView: boolean;
  onPerPersonViewChange: (perPerson: boolean) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onAssignLeg: (legId: string) => void;
  onAssignGroup: (group: UnplannedGroup) => void;
  onSuggestPlacements: (group: UnplannedGroup) => void;
  /** Docked only — send the rail away, leaving the board its full width. */
  onHide?: () => void;
  /** Drawer only — put the rail back beside the board for good. */
  onDock?: () => void;
}) => {
  const t = useT();

  return (
    <>
      {/* Wraps rather than truncates: "Por atribuir" beside a two-option
          toggle does not fit the rail's width, and the title is the half that
          was losing — it read as "Por atrib…". */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        flexWrap="wrap"
        sx={{ mb: 1 }}
        gap={1}
      >
        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ minWidth: 0 }}>
          {onHide && (
            <Tooltip title={t('transportPlanning.railCollapse')}>
              <IconButton size="small" onClick={onHide}>
                <ChevronLeftIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {onDock && (
            <Tooltip title={t('transportPlanning.railDock')}>
              <IconButton size="small" aria-label={t('transportPlanning.railDock')} onClick={onDock}>
                <PushPinOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <Typography variant="subtitle1" noWrap>
            {t('transportPlanning.railTitle')}
          </Typography>
        </Stack>
        {board.unassignedLegIds.length > 0 && (
          <ToggleButtonGroup
            size="small"
            exclusive
            value={perPersonView ? 'person' : 'group'}
            onChange={(_e, value) => value && onPerPersonViewChange(value === 'person')}
          >
            <ToggleButton value="group" aria-label={t('transportPlanning.railViewGrouped')}>
              {t('transportPlanning.railViewGrouped')}
            </ToggleButton>
            <ToggleButton value="person" aria-label={t('transportPlanning.railViewPerPerson')}>
              {t('transportPlanning.railViewPerPerson')}
            </ToggleButton>
          </ToggleButtonGroup>
        )}
      </Stack>

      {board.unassignedLegIds.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          {t('transportPlanning.railEmpty')}
        </Typography>
      )}

      <Stack spacing={1}>
        {perPersonView
          ? board.unassignedLegIds.map((legId) => {
              const leg = board.legsById[legId];
              if (!leg) return null;
              return (
                <UnassignedLegCard
                  key={legId}
                  leg={leg}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  onAssign={() => onAssignLeg(legId)}
                />
              );
            })
          : unplannedGroups.map((group) => (
              <UnplannedGroupCard
                key={group.key}
                group={group}
                legsById={board.legsById}
                vehicles={board.lanes.map((lane) => lane.vehicle)}
                onAssignGroup={() => onAssignGroup(group)}
                onAssignPerson={onAssignLeg}
                onSuggestPlacements={() => onSuggestPlacements(group)}
              />
            ))}
      </Stack>
    </>
  );
};
