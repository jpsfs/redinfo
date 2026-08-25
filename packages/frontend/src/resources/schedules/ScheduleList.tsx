import { useState } from 'react';
import {
  Datagrid,
  DateField,
  FunctionField,
  List,
  SelectInput,
  TopToolbar,
  usePermissions,
} from 'react-admin';
import { Alert, Box, Button, Chip, LinearProgress, Stack, Tooltip, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import {
  Action,
  AVAILABILITY_WINDOW_CATEGORIES,
  hasPermission,
  Schedule,
  ScheduleStatus,
  UserRole,
} from '@redinfo/shared';
import { windowCategoryLabel } from '../../i18n/labels';
import { useT } from '../../i18n/useT';
import { formatDateRange } from '../../utils/dates';
import { WindowCategoryChip } from '../availability/WindowIdentity';
import { CreateScheduleDialog } from './CreateScheduleDialog';

export const ScheduleStatusChip = ({ status }: { status?: string }) => {
  const t = useT();
  return status === ScheduleStatus.PUBLISHED ? (
    <Chip size="small" label={t('schedule.statusPublished')} color="success" />
  ) : (
    <Chip size="small" label={t('schedule.statusDraft')} variant="outlined" />
  );
};

/**
 * Only a coordinator starts a schedule. Everyone else reaches this list to read
 * a published rota, so the toolbar is not offered to them at all rather than
 * offered and refused.
 */
const ScheduleListActions = () => {
  const { permissions } = usePermissions<UserRole>();
  const [open, setOpen] = useState(false);

  const t = useT();
  if (!permissions || !hasPermission(permissions, Action.MANAGE_SCHEDULES)) return null;

  return (
    <TopToolbar>
      <Button size="small" startIcon={<AddIcon />} onClick={() => setOpen(true)}>
        {t('scheduleList.buildSchedulePrompt')}
      </Button>
      <CreateScheduleDialog open={open} onClose={() => setOpen(false)} />
    </TopToolbar>
  );
};

/** How full a schedule is, at a glance, without loading its whole board. */
const FillBar = ({ schedule }: { schedule: Schedule }) => {
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
const ScheduleFlags = ({ schedule }: { schedule: Schedule }) => {
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

const actorName = (actor?: { firstName: string; lastName: string } | null) =>
  actor ? `${actor.firstName} ${actor.lastName}` : '—';

/**
 * Every schedule, newest first — which is also the history the ACs ask for:
 * one row per window, filterable by the window's category and by status.
 */
export const ScheduleList = () => {
  const t = useT();

  const scheduleFilters = [
    <SelectInput
      key="category"
      source="category"
      alwaysOn
      choices={AVAILABILITY_WINDOW_CATEGORIES.map((category) => ({
        id: category,
        name: windowCategoryLabel(t, category),
      }))}
    />,
    <SelectInput
      key="status"
      source="status"
      choices={[
        { id: ScheduleStatus.DRAFT, name: t('schedule.statusDraft') },
        { id: ScheduleStatus.PUBLISHED, name: t('schedule.statusPublished') },
      ]}
    />,
  ];

  return (
  <List
    actions={<ScheduleListActions />}
    filters={scheduleFilters}
    sort={{ field: 'createdAt', order: 'DESC' }}
    empty={false}
  >
    <>
      <Alert severity="info" sx={{ mb: 2 }}>
        {t('scheduleList.overlapRuleInfo')}
      </Alert>
      <Datagrid rowClick="show" bulkActionButtons={false}>
        <FunctionField
          label={t('scheduleList.colWindow')}
          render={(record: Schedule) => (
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <WindowCategoryChip category={record.window?.category} />
              <Typography variant="body2" color="text.secondary">
                {record.window?.name || '—'}
              </Typography>
            </Stack>
          )}
        />
        <FunctionField
          label={t('scheduleList.colDates')}
          render={(record: Schedule) =>
            record.window
              ? formatDateRange(t, record.window.startDate, record.window.endDate)
              : '—'
          }
        />
        <FunctionField
          label={t('scheduleList.colSlotsFilled')}
          render={(record: Schedule) => <FillBar schedule={record} />}
        />
        <FunctionField
          label={t('scheduleList.colFlags')}
          render={(record: Schedule) => <ScheduleFlags schedule={record} />}
        />
        <FunctionField
          source="status"
          render={(record: Schedule) => <ScheduleStatusChip status={record.status} />}
        />
        <FunctionField
          source="publishedBy"
          render={(record: Schedule) =>
            record.publishedAt ? actorName(record.publishedBy) : '—'
          }
        />
        <DateField source="publishedAt" showTime emptyText="—" />
      </Datagrid>
    </>
  </List>
  );
};
