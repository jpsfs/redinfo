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
  useListContext,
} from 'react-admin';
import { Link, useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Stack,
  Typography,
} from '@mui/material';
import BoltIcon from '@mui/icons-material/Bolt';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import { AVAILABILITY_WINDOW_CATEGORIES, AvailabilityWindow, AvailabilityWindowStatus, Holiday } from '@redinfo/shared';
import { apiFetch } from '../../api';
import { useIsMobile } from '../../hooks/useIsMobile';
import { windowCategoryLabel } from '../../i18n/labels';
import { useT } from '../../i18n/useT';
import { formatDate, formatDateRange, toIsoDate } from '../../utils/dates';
import { EmergencyWindowDialog } from './EmergencyWindowDialog';
import { WindowCategoryChip, WindowStatusChip } from './WindowIdentity';
import { WindowListCard } from './WindowListCard';

/**
 * Two ways to open a window: pick a month and go, or build the shifts day by
 * day. The month shortcut covers the urgent case, where the standard grid is
 * fine and the only question is which month.
 *
 * `TopToolbar`'s own layout never wraps its children, so the three buttons —
 * two of them multi-word — run off a phone's width if left to it. Below `sm`
 * they render in a wrapping `Stack` instead, at the cost of `TopToolbar`'s own
 * chrome, which is desktop-only affordance anyway.
 */
export const WindowListActions = () => {
  const t = useT();
  const isMobile = useIsMobile();
  const [emergencyOpen, setEmergencyOpen] = useState(false);

  const buttons = (
    <>
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
    </>
  );

  return (
    <>
      {isMobile ? (
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ px: 2, pb: 1 }}>
          {buttons}
        </Stack>
      ) : (
        <TopToolbar>{buttons}</TopToolbar>
      )}
      <EmergencyWindowDialog
        open={emergencyOpen}
        onClose={() => setEmergencyOpen(false)}
      />
    </>
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

/** Stacked cards instead of a table — the mobile replacement for `Datagrid`. */
const MobileWindowList = () => {
  const { data, isLoading } = useListContext<AvailabilityWindow>();
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
      {(data ?? []).map((window) => (
        <WindowListCard
          key={window.id}
          window={window}
          onOpen={() => navigate(`/availability-windows/${window.id}/show`)}
        />
      ))}
    </Stack>
  );
};

export const AvailabilityWindowList = () => {
  const t = useT();
  const isMobile = useIsMobile();

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
      {isMobile ? (
        <MobileWindowList />
      ) : (
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
      )}
    </>
  </List>
  );
};
