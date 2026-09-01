import { Box, Chip, LinearProgress, Stack, Tooltip, Typography } from '@mui/material';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { Schedule, ScheduleStatus } from '@redinfo/shared';
import { useT } from '../../i18n/useT';

/**
 * Bits shared between the desktop `Datagrid` row and the mobile
 * `ScheduleListCard` on `/schedules` — pulled out of `ScheduleList.tsx` so the
 * card can use them without importing back from the list screen.
 */

export const ScheduleStatusChip = ({ status }: { status?: string }) => {
  const t = useT();
  return status === ScheduleStatus.PUBLISHED ? (
    <Chip size="small" label={t('schedule.statusPublished')} color="success" />
  ) : (
    <Chip size="small" label={t('schedule.statusDraft')} variant="outlined" />
  );
};

/** How full a schedule is, at a glance, without loading its whole board. */
export const FillBar = ({ schedule }: { schedule: Schedule }) => {
  const stats = schedule.stats;
  if (!stats || stats.requiredSlots === 0) {
    return (
      <Typography variant="caption" color="text.secondary">
        —
      </Typography>
    );
  }
  const percent = Math.min(100, Math.round((stats.filledSlots / stats.requiredSlots) * 100));
  const complete = stats.filledSlots >= stats.requiredSlots;

  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <LinearProgress
        variant="determinate"
        value={percent}
        color={complete ? 'success' : 'warning'}
        sx={{ width: 96, height: 6, borderRadius: 3 }}
      />
      <Typography variant="caption" color="text.secondary">
        {stats.filledSlots} / {stats.requiredSlots}
      </Typography>
    </Stack>
  );
};

/** Gaps and overrides as counts, so a coordinator can triage the list. */
export const ScheduleFlags = ({ schedule }: { schedule: Schedule }) => {
  const t = useT();
  const stats = schedule.stats;
  if (!stats || (stats.shiftsWithGaps === 0 && stats.overrideCount === 0)) {
    return (
      <Typography variant="caption" color="text.secondary">
        —
      </Typography>
    );
  }
  return (
    <Stack direction="row" spacing={1.5} alignItems="center">
      {stats.shiftsWithGaps > 0 && (
        <Tooltip title={t('scheduleList.gapsTooltip', { count: stats.shiftsWithGaps })}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'error.dark' }}>
            <WarningAmberIcon sx={{ fontSize: 16 }} />
            <Typography variant="caption" sx={{ fontWeight: 600 }}>
              {stats.shiftsWithGaps}
            </Typography>
          </Box>
        </Tooltip>
      )}
      {stats.overrideCount > 0 && (
        <Tooltip title={t('scheduleList.overridesTooltip', { count: stats.overrideCount })}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'warning.dark' }}>
            <SwapHorizIcon sx={{ fontSize: 16 }} />
            <Typography variant="caption" sx={{ fontWeight: 600 }}>
              {stats.overrideCount}
            </Typography>
          </Box>
        </Tooltip>
      )}
    </Stack>
  );
};

export const actorName = (actor?: { firstName: string; lastName: string } | null) =>
  actor ? `${actor.firstName} ${actor.lastName}` : '—';
