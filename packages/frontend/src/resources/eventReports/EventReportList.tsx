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
import { Box, Button, Chip, Stack } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import {
  Action,
  EVENT_REPORT_TYPES,
  EventReport,
  EventReportCounts,
  EventReportType,
  UserRole,
  hasPermission,
  totalKilometres,
  transportedVictimCount,
} from '@redinfo/shared';
import { apiFetch } from '../../api';
import { destinationLabel, reportTypeLabel, t } from '../../i18n/labels';
import { timeOfDay } from './reportDraft';

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
    <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap' }} useFlexGap>
      <Chip
        label={`${t('report.all')}${counts ? ` · ${counts.ALL}` : ''}`}
        color={active ? 'default' : 'primary'}
        variant={active ? 'outlined' : 'filled'}
        onClick={() => select(undefined)}
        sx={{ height: 40, fontWeight: 600 }}
      />
      {EVENT_REPORT_TYPES.map((type) => (
        <Chip
          key={type}
          label={`${reportTypeLabel(type)}${counts ? ` · ${counts[type]}` : ''}`}
          color={active === type ? 'primary' : 'default'}
          variant={active === type ? 'filled' : 'outlined'}
          onClick={() => select(type)}
          sx={{ height: 40, fontWeight: 600 }}
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

/** `1 · CHUC — Hospital Geral`, or `3 · 1 transportada`. */
export function victimSummary(report: EventReport): string {
  if (report.victims.length === 0) return '—';
  if (report.victims.length === 1) {
    const [victim] = report.victims;
    const where =
      victim.destinationHospital?.name ?? destinationLabel(victim.destinationKind);
    return `1 · ${where}`;
  }
  const transported = transportedVictimCount(report.victims);
  return `${report.victims.length} · ${transported}`;
}

/** `AA-12-BC · 42 km`, or `2 · 87 km` once there is more than one. */
export function vehicleSummary(report: EventReport): string {
  if (report.vehicles.length === 0) return '—';
  const kilometres = `${totalKilometres(report.vehicles)} ${t('field.kilometresShort')}`;
  if (report.vehicles.length === 1) {
    return `${report.vehicles[0].vehicle?.licensePlate ?? ''} · ${kilometres}`;
  }
  return `${report.vehicles.length} · ${kilometres}`;
}

export const crewSummary = (report: EventReport): string => {
  const names = report.crew
    .map((member) => member.user?.lastName)
    .filter((name): name is string => Boolean(name));
  if (names.length === 0) return '—';
  return names.length <= 2 ? names.join(' · ') : `${names.slice(0, 2).join(' · ')} · +${names.length - 2}`;
};

/**
 * Every report, newest first.
 *
 * One list for all three kinds rather than three screens: a coordinator's
 * question is usually "what happened last week", not "what emergencies happened
 * last week", and the type is a column and a filter rather than a place.
 */
export const EventReportList = () => (
  <List
    actions={<ListActions />}
    sort={{ field: 'occurredOn', order: 'DESC' }}
    perPage={25}
  >
    <Box>
      <TypeTabs />
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
            <Chip size="small" label={reportTypeLabel(record.type)} variant="outlined" />
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
        <FunctionField label={t('field.victims')} render={victimSummary} />
        <FunctionField label={t('field.crew')} render={crewSummary} />
        <FunctionField label={t('field.vehicle')} render={vehicleSummary} />
        <FunctionField
          label={t('field.attachments')}
          render={(record: EventReport) => record.attachments.length || '—'}
        />
      </Datagrid>
    </Box>
  </List>
);
