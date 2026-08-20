import { useEffect, useState } from 'react';
import {
  CreateButton,
  Datagrid,
  DateField,
  FunctionField,
  List,
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
import EventBusyIcon from '@mui/icons-material/EventBusy';
import { AvailabilityWindow, AvailabilityWindowStatus, Holiday } from '@redinfo/shared';
import { apiFetch } from '../../api';
import { formatDate, formatDateRange, toIsoDate } from '../../utils/dates';

const ListActions = () => (
  <TopToolbar>
    <Button
      component={Link}
      to="/holidays"
      size="small"
      startIcon={<EventBusyIcon />}
    >
      Manage holidays
    </Button>
    <CreateButton label="Open window" />
  </TopToolbar>
);

export const WindowStatusChip = ({ status }: { status?: string }) =>
  status === AvailabilityWindowStatus.OPEN ? (
    <Chip size="small" label="Open" color="success" variant="outlined" />
  ) : (
    <Chip size="small" label="Closed" variant="outlined" />
  );

const actorName = (actor?: { firstName: string; lastName: string } | null) =>
  actor ? `${actor.firstName} ${actor.lastName}` : '—';

/**
 * The upcoming-holidays panel from the design: coordinators pick window dates
 * against it, since a holiday inside the window doubles that day's shifts.
 */
const UpcomingHolidays = () => {
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
          Upcoming holidays
        </Typography>
        <Stack spacing={0.5}>
          {holidays.map((holiday) => (
            <Box
              key={holiday.id}
              sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}
            >
              <Typography variant="body2" color="text.secondary">
                {formatDate(holiday.date)}
              </Typography>
              <Typography variant="body2">{holiday.name}</Typography>
            </Box>
          ))}
        </Stack>
        <Button component={Link} to="/holidays" size="small" sx={{ mt: 1, px: 0 }}>
          Manage holidays
        </Button>
      </CardContent>
    </Card>
  );
};

export const AvailabilityWindowList = () => (
  <List
    actions={<ListActions />}
    sort={{ field: 'openedAt', order: 'DESC' }}
    empty={false}
  >
    <>
      <UpcomingHolidays />
      <Alert severity="info" sx={{ mb: 2 }}>
        Only one availability window can be open at a time. Volunteers can submit
        and amend their availability until the open window is closed.
      </Alert>
      <Datagrid rowClick="show" bulkActionButtons={false}>
        <FunctionField
          label="Window"
          render={(record: AvailabilityWindow) =>
            formatDateRange(record.startDate, record.endDate)
          }
        />
        <FunctionField
          label="Status"
          render={(record: AvailabilityWindow) => <WindowStatusChip status={record.status} />}
        />
        <FunctionField
          label="Opened by"
          render={(record: AvailabilityWindow) => actorName(record.openedBy)}
        />
        <DateField source="openedAt" label="Opened at" showTime />
        <FunctionField
          label="Closed by"
          render={(record: AvailabilityWindow) => actorName(record.closedBy)}
        />
        <DateField source="closedAt" label="Closed at" showTime emptyText="—" />
      </Datagrid>
    </>
  </List>
);
