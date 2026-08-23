import { useEffect, useState } from 'react';
import {
  Datagrid,
  FunctionField,
  List,
  TopToolbar,
  useListContext,
  usePermissions,
} from 'react-admin';
import { useNavigate } from 'react-router-dom';
import { Box, Button, Chip, CircularProgress, Paper, Stack } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import {
  Action,
  EVENT_REPORT_TYPES,
  EventReport,
  EventReportCounts,
  EventReportType,
  UserRole,
  hasPermission,
} from '@redinfo/shared';
import { apiFetch } from '../../api';
import { CategoryChip } from '../../components/CategoryChip';
import { useIsMobile } from '../../hooks/useIsMobile';
import { reportTypeLabel, t } from '../../i18n/labels';
import { MonthFilter } from './MonthFilter';
import { ReportListCard } from './ReportListCard';
import { timeOfDay } from './reportDraft';

import { crewSummary, vehicleSummary, victimSummary } from './reportSummaries';

// Re-exported for `EventReportShow.test.tsx`, which unit-tests these directly.
export { crewSummary, vehicleSummary, victimSummary };

/**
 * Filter tabs, one per kind of activity plus "all".
 *
 * Every type is always shown, with its count, so a tab reading zero says "none
 * of these yet" rather than vanishing and leaving the reader wondering whether
 * the feature exists. The counts come from a dedicated endpoint that ignores
 * the type filter, so clicking one tab does not renumber the others.
 */
const TypeTabs = () => {
  const { filterValues, setFilters, displayedFilters } = useListContext();
  const [counts, setCounts] = useState<EventReportCounts | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<EventReportCounts>('/event-reports/counts')
      .then((loaded) => {
        if (!cancelled) setCounts(loaded);
      })
      .catch(() => {
        // A missing count is a missing number on a chip, not a broken list.
        if (!cancelled) setCounts(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const select = (type?: EventReportType) => {
    const { type: _dropped, ...rest } = filterValues;
    setFilters(type ? { ...rest, type } : rest, displayedFilters);
  };

  const active = filterValues.type as EventReportType | undefined;

  return (
    <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }} useFlexGap>
      <Chip
        label={`${t('report.all')}${counts ? ` · ${counts.ALL}` : ''}`}
        color={active ? 'default' : 'primary'}
        variant={active ? 'outlined' : 'filled'}
        onClick={() => select(undefined)}
        sx={{ height: 40, fontWeight: 600 }}
      />
      {EVENT_REPORT_TYPES.map((type) => (
        <CategoryChip
          key={type}
          category={type}
          label={`${reportTypeLabel(type)}${counts ? ` · ${counts[type]}` : ''}`}
          selected={active === type}
          onClick={() => select(type)}
          sx={{ height: 40, fontWeight: 600, cursor: 'pointer' }}
        />
      ))}
    </Stack>
  );
};

const ListActions = () => {
  const { permissions } = usePermissions<UserRole>();
  const navigate = useNavigate();

  if (!permissions || !hasPermission(permissions, Action.CREATE_EVENT_REPORT)) {
    return <TopToolbar />;
  }

  return (
    <TopToolbar>
      <Button
        startIcon={<AddIcon />}
        onClick={() => navigate('/event-reports/create')}
        variant="contained"
      >
        {t('action.newReport')}
      </Button>
    </TopToolbar>
  );
};

/** Stacked cards instead of a table — the mobile replacement for `Datagrid`. */
const MobileReportList = () => {
  const { data, isLoading } = useListContext<EventReport>();
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
      {(data ?? []).map((report) => (
        <ReportListCard
          key={report.id}
          report={report}
          onOpen={() => navigate(`/event-reports/${report.id}/show`)}
        />
      ))}
    </Stack>
  );
};

/**
 * Every report, newest first.
 *
 * One list for all three kinds rather than three screens: a coordinator's
 * question is usually "what happened last week", not "what emergencies happened
 * last week", and the type is a column and a filter rather than a place.
 */
export const EventReportList = () => {
  const isMobile = useIsMobile();

  return (
    <List
      actions={<ListActions />}
      sort={{ field: 'occurredOn', order: 'DESC' }}
      perPage={25}
      component="div"
    >
      <Box sx={{ pt: 2 }}>
        <Paper
          variant="outlined"
          sx={{
            p: 2,
            mb: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 2,
          }}
        >
          <TypeTabs />
          <MonthFilter />
        </Paper>

        {isMobile ? (
          <MobileReportList />
        ) : (
          <Paper variant="outlined">
            <Datagrid rowClick="show" bulkActionButtons={false}>
              <FunctionField
                label={t('field.reportNumber')}
                render={(record: EventReport) =>
                  // Rendered rather than stored: `(type, number, year)` is the truth.
                  `${reportTypeLabel(record.type).slice(0, 3).toUpperCase()} ${String(
                    record.number,
                  ).padStart(3, '0')}/${record.year}`
                }
              />
              <FunctionField
                label={t('field.type')}
                render={(record: EventReport) => (
                  <CategoryChip
                    category={record.type}
                    label={reportTypeLabel(record.type)}
                    size="small"
                  />
                )}
              />
              <FunctionField
                label={t('field.date')}
                render={(record: EventReport) => record.occurredOn}
              />
              <FunctionField
                label={t('field.hours')}
                render={(record: EventReport) =>
                  `${timeOfDay(record.startedAt) || '--:--'}–${timeOfDay(record.endedAt) || '--:--'}`
                }
              />
              <FunctionField
                label={t('field.locality')}
                render={(record: EventReport) => record.locality?.name ?? '—'}
              />
              <FunctionField label={t('field.crew')} render={crewSummary} />
              <FunctionField label={t('field.vehicle')} render={vehicleSummary} />
            </Datagrid>
          </Paper>
        )}
      </Box>
    </List>
  );
};
