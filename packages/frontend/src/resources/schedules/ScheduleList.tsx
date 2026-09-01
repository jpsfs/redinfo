import { useState } from 'react';
import {
  Datagrid,
  DateField,
  FunctionField,
  List,
  TopToolbar,
  useListContext,
  usePermissions,
} from 'react-admin';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import {
  Action,
  AVAILABILITY_WINDOW_CATEGORIES,
  hasPermission,
  Schedule,
  ScheduleStatus,
  UserRole,
} from '@redinfo/shared';
import { CategoryChip } from '../../components/CategoryChip';
import { useIsMobile } from '../../hooks/useIsMobile';
import { windowCategoryLabel } from '../../i18n/labels';
import { useT } from '../../i18n/useT';
import { formatDateRange } from '../../utils/dates';
import { WindowCategoryChip } from '../availability/WindowIdentity';
import { CreateScheduleDialog } from './CreateScheduleDialog';
import { actorName, FillBar, ScheduleFlags, ScheduleStatusChip } from './ScheduleIdentity';
import { ScheduleListCard } from './ScheduleListCard';

export { ScheduleStatusChip };

/**
 * Only a coordinator starts a schedule. Everyone else reaches this list to read
 * a published rota, so the toolbar is not offered to them at all rather than
 * offered and refused.
 */
const ScheduleListActions = () => {
  const { permissions } = usePermissions<UserRole[]>();
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

/** Stacked cards instead of a table — the mobile replacement for `Datagrid`. */
const MobileScheduleList = () => {
  const { data, isLoading } = useListContext<Schedule>();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  return (
    <Stack spacing={1.5}>
      {(data ?? []).map((schedule) => (
        <ScheduleListCard
          key={schedule.id}
          schedule={schedule}
          onOpen={() => navigate(`/schedules/${schedule.id}/show`)}
        />
      ))}
    </Stack>
  );
};

/**
 * Category and status, together.
 *
 * A plain body element rather than `<List filters>`: `ScheduleListActions` is
 * a custom `actions` element, and `ListToolbar` only threads `filters` into
 * react-admin's *default* toolbar — with a custom one it renders the actions
 * untouched and the filter form never appears
 * (`ra-ui-materialui/dist/list/ListToolbar.js`), same trap fixed on
 * `/availability-windows`' `WindowFilterBar`.
 */
export const ScheduleFilterBar = () => {
  const t = useT();
  const { filterValues, setFilters, displayedFilters } = useListContext();

  const activeCategory = filterValues.category as string | undefined;
  const selectCategory = (category?: string) => {
    const { category: _dropped, ...rest } = filterValues;
    setFilters(category ? { ...rest, category } : rest, displayedFilters);
  };

  const activeStatus = (filterValues.status as string | undefined) ?? '';
  const selectStatus = (status: string) => {
    setFilters({ ...filterValues, status }, displayedFilters);
  };

  return (
    <Paper
      variant="outlined"
      sx={{ p: 2, mb: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        <Typography variant="caption" color="text.secondary" sx={{ minWidth: 64 }}>
          {t('scheduleList.filterCategoryLabel')}
        </Typography>
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }} useFlexGap>
          <Chip
            label={t('scheduleList.allCategories')}
            color={activeCategory ? 'default' : 'primary'}
            variant={activeCategory ? 'outlined' : 'filled'}
            onClick={() => selectCategory(undefined)}
            sx={{ height: 32, fontWeight: 600 }}
          />
          {AVAILABILITY_WINDOW_CATEGORIES.map((category) => (
            <CategoryChip
              key={category}
              category={category}
              label={windowCategoryLabel(t, category)}
              selected={activeCategory === category}
              onClick={() => selectCategory(category)}
              sx={{ height: 32, fontWeight: 600, cursor: 'pointer' }}
            />
          ))}
        </Stack>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        <Typography variant="caption" color="text.secondary" sx={{ minWidth: 64 }}>
          {t('scheduleList.filterStatusLabel')}
        </Typography>
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }} useFlexGap>
          <Chip
            size="small"
            label={t('scheduleList.statusAll')}
            color={activeStatus === '' ? 'primary' : 'default'}
            variant={activeStatus === '' ? 'filled' : 'outlined'}
            onClick={() => selectStatus('')}
          />
          <Chip
            size="small"
            label={t('schedule.statusDraft')}
            color={activeStatus === ScheduleStatus.DRAFT ? 'primary' : 'default'}
            variant={activeStatus === ScheduleStatus.DRAFT ? 'filled' : 'outlined'}
            onClick={() => selectStatus(ScheduleStatus.DRAFT)}
          />
          <Chip
            size="small"
            label={t('schedule.statusPublished')}
            color={activeStatus === ScheduleStatus.PUBLISHED ? 'success' : 'default'}
            variant={activeStatus === ScheduleStatus.PUBLISHED ? 'filled' : 'outlined'}
            onClick={() => selectStatus(ScheduleStatus.PUBLISHED)}
          />
        </Stack>
      </Box>
    </Paper>
  );
};

/**
 * Every schedule, newest first — which is also the history the ACs ask for:
 * one row per window, filterable by the window's category and by status.
 *
 * The list is always newest-first server-side (`SchedulesService.findAll`
 * has no sort parameter — it's a fixed `createdAt desc`), so every column
 * below is marked `sortable={false}`: a clickable header would promise a
 * reorder the backend can't deliver.
 */
export const ScheduleList = () => {
  const t = useT();
  const isMobile = useIsMobile();

  return (
    <List
      actions={<ScheduleListActions />}
      sort={{ field: 'createdAt', order: 'DESC' }}
      empty={false}
    >
    <>
      <ScheduleFilterBar />
      <Alert severity="info" sx={{ mb: 2 }}>
        {t('scheduleList.overlapRuleInfo')}
      </Alert>
      {isMobile ? (
        <MobileScheduleList />
      ) : (
        <Datagrid rowClick="show" bulkActionButtons={false}>
          <FunctionField
            label={t('scheduleList.colWindow')}
            sortable={false}
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
            sortable={false}
            render={(record: Schedule) =>
              record.window
                ? formatDateRange(t, record.window.startDate, record.window.endDate)
                : '—'
            }
          />
          <FunctionField
            label={t('scheduleList.colSlotsFilled')}
            sortable={false}
            render={(record: Schedule) => <FillBar schedule={record} />}
          />
          <FunctionField
            label={t('scheduleList.colFlags')}
            sortable={false}
            render={(record: Schedule) => <ScheduleFlags schedule={record} />}
          />
          <FunctionField
            source="status"
            sortable={false}
            render={(record: Schedule) => <ScheduleStatusChip status={record.status} />}
          />
          <FunctionField
            source="publishedBy"
            sortable={false}
            render={(record: Schedule) =>
              record.publishedAt ? actorName(record.publishedBy) : '—'
            }
          />
          <DateField source="publishedAt" showTime emptyText="—" sortable={false} />
        </Datagrid>
      )}
    </>
  </List>
  );
};
