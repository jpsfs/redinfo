import { useEffect, useState } from 'react';
import {
  DateField,
  FunctionField,
  Show,
  SimpleShowLayout,
  useNotify,
  useRecordContext,
  useRefresh,
} from 'react-admin';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  Typography,
} from '@mui/material';
import EventNoteIcon from '@mui/icons-material/EventNote';
import LockIcon from '@mui/icons-material/Lock';
import { useNavigate } from 'react-router-dom';
import {
  AvailabilityMatrixResponse,
  AvailabilityWindow,
  availabilityWindowLabel,
  AvailabilityWindowStatus,
  Schedule,
} from '@redinfo/shared';
import { apiFetch } from '../../api';
import { useT } from '../../i18n/useT';
import { formatDateRange } from '../../utils/dates';
import { AvailabilityMatrix } from './AvailabilityMatrix';
import { WindowStatusChip } from './AvailabilityWindowList';
import { WindowIdentity, WindowRoleChips } from './WindowIdentity';

/**
 * Closing a window is irreversible and immediately blocks submissions, so the
 * confirmation restates who has and hasn't answered — the count a coordinator
 * actually decides on.
 */
const CloseWindowButton = () => {
  const t = useT();
  const record = useRecordContext<AvailabilityWindow>();
  const notify = useNotify();
  const refresh = useRefresh();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [stats, setStats] = useState<AvailabilityMatrixResponse['responseStats'] | null>(null);

  useEffect(() => {
    if (!open || !record?.id) return;
    let cancelled = false;
    apiFetch<AvailabilityMatrixResponse>(
      `/availability/matrix?windowId=${encodeURIComponent(String(record.id))}`,
    )
      .then((matrix) => {
        if (!cancelled) setStats(matrix.responseStats);
      })
      .catch(() => {
        if (!cancelled) setStats(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, record?.id]);

  if (!record || record.status !== AvailabilityWindowStatus.OPEN) return null;

  const handleClose = async () => {
    setClosing(true);
    try {
      await apiFetch(`/availability-windows/${record.id}/close`, { method: 'POST' });
      notify(t('windowShow.closed'), { type: 'success' });
      setOpen(false);
      refresh();
    } catch (e) {
      notify(e instanceof Error ? e.message : t('windowShow.closeFailed'), { type: 'error' });
    } finally {
      setClosing(false);
    }
  };

  return (
    <>
      <Button
        variant="outlined"
        color="error"
        startIcon={<LockIcon />}
        onClick={() => setOpen(true)}
      >
        {t('windowShow.closeButton')}
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('windowShow.closeConfirmTitle')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t('windowShow.closeConfirmBody', {
              window: availabilityWindowLabel(record),
              dates: formatDateRange(record.startDate, record.endDate),
            })}
          </DialogContentText>
          {stats && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              {t('windowShow.closeStatsSummary', {
                submitted: stats.submitted,
                total: stats.total,
                declined: stats.declined,
                pending: stats.pending,
              })}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={closing}>
            {t('action.cancel')}
          </Button>
          <Button color="error" onClick={handleClose} disabled={closing}>
            {closing ? <CircularProgress size={18} /> : t('windowShow.closeButton')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

const WindowHeader = () => {
  const record = useRecordContext<AvailabilityWindow>();
  if (!record) return null;
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 2,
        flexWrap: 'wrap',
      }}
    >
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="h6">
            {formatDateRange(record.startDate, record.endDate)}
          </Typography>
          <WindowStatusChip status={record.status} />
        </Box>
        <Box sx={{ mt: 0.5 }}>
          <WindowIdentity category={record.category} name={record.name} />
        </Box>
      </Box>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <ScheduleButton />
        <CloseWindowButton />
      </Box>
    </Box>
  );
};

/**
 * Into the schedule for this window, starting it if there is none.
 *
 * Offered while the window is still open as well as after it closes:
 * coordinators begin arranging cover before submissions end, and the builder
 * says plainly that availability may still change.
 */
const ScheduleButton = () => {
  const t = useT();
  const record = useRecordContext<AvailabilityWindow>();
  const notify = useNotify();
  const navigate = useNavigate();
  const [schedule, setSchedule] = useState<Schedule | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!record?.id) return;
    let cancelled = false;
    apiFetch<{ data: Schedule[] }>(
      `/schedules?windowId=${encodeURIComponent(String(record.id))}&perPage=1`,
    )
      .then((result) => {
        if (!cancelled) setSchedule(result.data[0] ?? null);
      })
      .catch(() => {
        // A volunteer reading a window has no schedule permission; the button
        // simply does not appear for them.
        if (!cancelled) setSchedule(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [record?.id]);

  if (!record || schedule === undefined) return null;

  const open = async () => {
    if (schedule) {
      navigate(`/schedules/${schedule.id}/show`);
      return;
    }
    setBusy(true);
    try {
      const created = await apiFetch<Schedule>('/schedules', {
        method: 'POST',
        body: { windowId: record.id },
      });
      navigate(`/schedules/${created.id}/show`);
    } catch (e) {
      notify(e instanceof Error ? e.message : t('windowShow.startScheduleFailed'), {
        type: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant="outlined"
      startIcon={busy ? <CircularProgress size={16} /> : <EventNoteIcon />}
      disabled={busy}
      onClick={() => void open()}
    >
      {schedule ? t('windowShow.openSchedule') : t('windowShow.buildSchedule')}
    </Button>
  );
};

const EmbeddedMatrix = () => {
  const record = useRecordContext<AvailabilityWindow>();
  if (!record?.id) return null;
  return <AvailabilityMatrix windowId={String(record.id)} />;
};

export const AvailabilityWindowShow = () => {
  const t = useT();
  return (
    <Show title={t('windowShow.pageTitle')}>
      <SimpleShowLayout>
        <WindowHeader />

        <FunctionField
          label={t('windowShow.rolesHeading')}
          render={(record: AvailabilityWindow) => <WindowRoleChips roles={record.roles} />}
        />

        <FunctionField
          source="openedBy"
          render={(record: AvailabilityWindow) =>
            record.openedBy ? `${record.openedBy.firstName} ${record.openedBy.lastName}` : '—'
          }
        />
        <DateField source="openedAt" showTime />
        <FunctionField
          source="closedBy"
          render={(record: AvailabilityWindow) =>
            record.closedBy ? `${record.closedBy.firstName} ${record.closedBy.lastName}` : '—'
          }
        />
        <DateField source="closedAt" showTime emptyText="—" />

        <Divider sx={{ my: 2 }} />

        <EmbeddedMatrix />
      </SimpleShowLayout>
    </Show>
  );
};
