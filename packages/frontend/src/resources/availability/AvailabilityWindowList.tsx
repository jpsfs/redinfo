import { useEffect, useState } from 'react';
import {
  CreateButton,
  Datagrid,
  DateField,
  FunctionField,
  List,
  SelectInput,
  TextField,
  TopToolbar,
} from 'react-admin';
import { Link } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
  Typography,
} from '@mui/material';
import BoltIcon from '@mui/icons-material/Bolt';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import {
  AVAILABILITY_WINDOW_CATEGORIES,
  AvailabilityWindow,
  AvailabilityWindowStatus,
  Holiday,
} from '@redinfo/shared';
import { apiFetch } from '../../api';
import { windowCategoryLabel } from '../../i18n/labels';
import { useT } from '../../i18n/useT';
import { formatDate, formatDateRange, toIsoDate } from '../../utils/dates';
import { EmergencyWindowDialog } from './EmergencyWindowDialog';
import { WindowCategoryChip } from './WindowIdentity';

/**
 * Two ways to open a window: pick a month and go, or build the shifts day by
 * day. The month shortcut covers the urgent case, where the standard grid is
 * fine and the only question is which month.
 */
export const WindowListActions = () => {
  const t = useT();
  const [emergencyOpen, setEmergencyOpen] = useState(false);

  return (
    <TopToolbar>
      <Button
        component={Link}
        to="/holidays"
        size="small"
        startIcon={<EventBusyIcon />}
      >
        {t('windowList.manageHolidays')}
      </Button>
      <Button
        size="small"
        startIcon={<BoltIcon />}
        onClick={() => setEmergencyOpen(true)}
      >
        {t('windowList.newEmergencyAvailability')}
      </Button>
      <CreateButton label={t('windowList.newWindow')} />
      <EmergencyWindowDialog
        open={emergencyOpen}
        onClose={() => setEmergencyOpen(false)}
      />
    </TopToolbar>
  );
};

export const WindowStatusChip = ({ status }: { status?: string }) => {
  const t = useT();
  return status === AvailabilityWindowStatus.OPEN ? (
    <Chip size="small" label={t('windowList.statusOpen')} color="success" variant="outlined" />
  ) : (
    <Chip size="small" label={t('windowList.statusClosed')} variant="outlined" />
  );
};

const actorName = (actor?: { firstName: string; lastName: string } | null) =>
  actor ? `${actor.firstName} ${actor.lastName}` : '—';

/**
 * The upcoming-holidays panel from the design: coordinators pick window dates
 * against it, since a holiday inside the window doubles that day's shifts.
 */
const UpcomingHolidays = () => {
  const t = useT();
  const [holidays, setHolidays] = useState<Holiday[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const from = toIsoDate(new Date());
    apiFetch<{ data: Holiday[] }>(`/holidays?from=${from}&perPage=5`)
      .then((result) => {
        if (!cancelled) setHolidays(result.data);
      })
      .catch(() => {
        if (!cancelled) setHolidays([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!holidays?.length) return null;

  return (
    <Card variant="outlined" sx={{ mb: 2 }}>
      <CardContent>
        <Typography variant="subtitle2" gutterBottom>
          {t('windowList.upcomingHolidays')}
        </Typography>
        <Stack spacing={0.5}>
          {holidays.map((holiday) => (
            <Box
              key={holiday.id}
              sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}
            >
              <Typography variant="body2" color="text.secondary">
                {formatDate(t, holiday.date)}
              </Typography>
              <Typography variant="body2">{holiday.name}</Typography>
            </Box>
          ))}
        </Stack>
        <Button component={Link} to="/holidays" size="small" sx={{ mt: 1, px: 0 }}>
          {t('windowList.manageHolidays')}
        </Button>
      </CardContent>
    </Card>
  );
};

export const AvailabilityWindowList = () => {
  const t = useT();

  /** Categories are independent rotas, so filtering by one is the common view. */
  const windowFilters = [
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
        { id: AvailabilityWindowStatus.OPEN, name: t('windowList.statusOpen') },
        { id: AvailabilityWindowStatus.CLOSED, name: t('windowList.statusClosed') },
      ]}
    />,
  ];

  return (
    <List
      actions={<WindowListActions />}
      filters={windowFilters}
      sort={{ field: 'openedAt', order: 'DESC' }}
      empty={false}
    >
    <>
      <UpcomingHolidays />
      <Alert severity="info" sx={{ mb: 2 }}>
        {t('windowList.overlapRuleInfo')}
      </Alert>
      <Datagrid rowClick="show" bulkActionButtons={false}>
        <FunctionField
          label={t('windowList.colWindow')}
          render={(record: AvailabilityWindow) =>
            formatDateRange(t, record.startDate, record.endDate)
          }
        />
        <FunctionField
          source="category"
          render={(record: AvailabilityWindow) => (
            <WindowCategoryChip category={record.category} />
          )}
        />
        <TextField source="name" emptyText="—" />
        <FunctionField
          source="status"
          render={(record: AvailabilityWindow) => <WindowStatusChip status={record.status} />}
        />
        <FunctionField
          source="openedBy"
          render={(record: AvailabilityWindow) => actorName(record.openedBy)}
        />
        <DateField source="openedAt" showTime />
        <FunctionField
          source="closedBy"
          render={(record: AvailabilityWindow) => actorName(record.closedBy)}
        />
        <DateField source="closedAt" showTime emptyText="—" />
      </Datagrid>
    </>
  </List>
  );
};
