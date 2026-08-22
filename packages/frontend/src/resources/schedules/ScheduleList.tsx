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
  availabilityWindowCategoryLabel,
  hasPermission,
  Schedule,
  ScheduleStatus,
  UserRole,
} from '@redinfo/shared';
import { formatDateRange } from '../../utils/dates';
import { WindowCategoryChip } from '../availability/WindowIdentity';
import { CreateScheduleDialog } from './CreateScheduleDialog';

export const ScheduleStatusChip = ({ status }: { status?: string }) =>
  status === ScheduleStatus.PUBLISHED ? (
    <Chip size="small" label="Published" color="success" />
  ) : (
    <Chip size="small" label="Draft" variant="outlined" />
  );

/**
 * Only a coordinator starts a schedule. Everyone else reaches this list to read
 * a published rota, so the toolbar is not offered to them at all rather than
 * offered and refused.
 */
const ScheduleListActions = () => {
  const { permissions } = usePermissions<UserRole>();
  const [open, setOpen] = useState(false);

  if (!permissions || !hasPermission(permissions, Action.MANAGE_SCHEDULES)) return null;

  return (
    <TopToolbar>
      <Button size="small" startIcon={<AddIcon />} onClick={() => setOpen(true)}>
        Build schedule for a window…
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
        <Tooltip title={`${stats.shiftsWithGaps} shifts are not fully crewed`}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'error.dark' }}>
            <WarningAmberIcon sx={{ fontSize: 16 }} />
            <Typography variant="caption" sx={{ fontWeight: 600 }}>
              {stats.shiftsWithGaps}
            </Typography>
          </Box>
        </Tooltip>
      )}
      {stats.overrideCount > 0 && (
        <Tooltip title={`${stats.overrideCount} assignments were agreed off-platform`}>
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

const scheduleFilters = [
  <SelectInput
    key="category"
    source="category"
    label="Category"
    alwaysOn
    choices={AVAILABILITY_WINDOW_CATEGORIES.map((category) => ({
      id: category,
      name: availabilityWindowCategoryLabel(category),
    }))}
  />,
  <SelectInput
    key="status"
    source="status"
    label="Status"
    choices={[
      { id: ScheduleStatus.DRAFT, name: 'Draft' },
      { id: ScheduleStatus.PUBLISHED, name: 'Published' },
    ]}
  />,
];

const actorName = (actor?: { firstName: string; lastName: string } | null) =>
  actor ? `${actor.firstName} ${actor.lastName}` : '—';

/**
 * Every schedule, newest first — which is also the history the ACs ask for:
 * one row per window, filterable by the window's category and by status.
 */
export const ScheduleList = () => (
  <List
    actions={<ScheduleListActions />}
    filters={scheduleFilters}
    sort={{ field: 'createdAt', order: 'DESC' }}
    empty={false}
  >
    <>
      <Alert severity="info" sx={{ mb: 2 }}>
        A schedule is built for one availability window, over that window&apos;s dates
        and against its own shifts and roles. Windows of different categories are
        scheduled independently, even when their dates overlap.
      </Alert>
      <Datagrid rowClick="show" bulkActionButtons={false}>
        <FunctionField
          label="Window"
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
          label="Dates"
          render={(record: Schedule) =>
            record.window
              ? formatDateRange(record.window.startDate, record.window.endDate)
              : '—'
          }
        />
        <FunctionField
          label="Slots filled"
          render={(record: Schedule) => <FillBar schedule={record} />}
        />
        <FunctionField
          label="Flags"
          render={(record: Schedule) => <ScheduleFlags schedule={record} />}
        />
        <FunctionField
          label="Status"
          render={(record: Schedule) => <ScheduleStatusChip status={record.status} />}
        />
        <FunctionField
          label="Published by"
          render={(record: Schedule) =>
            record.publishedAt ? actorName(record.publishedBy) : '—'
          }
        />
        <DateField source="publishedAt" label="Published at" showTime emptyText="—" />
      </Datagrid>
    </>
  </List>
);
