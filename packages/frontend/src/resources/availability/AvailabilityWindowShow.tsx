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
      notify('Availability window closed', { type: 'success' });
      setOpen(false);
      refresh();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not close the window', { type: 'error' });
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
        Close window
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Close availability window?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Submissions will no longer be accepted for {availabilityWindowLabel(record)} (
            {formatDateRange(record.startDate, record.endDate)}) once this window is
            closed. This cannot be undone.
          </DialogContentText>
          {stats && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              {stats.submitted} of {stats.total} personnel have submitted availability.{' '}
              {stats.declined} {stats.declined === 1 ? 'has' : 'have'} declined and{' '}
              {stats.pending} {stats.pending === 1 ? 'has' : 'have'} not yet responded.
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={closing}>
            Cancel
          </Button>
          <Button color="error" onClick={handleClose} disabled={closing}>
            {closing ? <CircularProgress size={18} /> : 'Close window'}
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
      notify(e instanceof Error ? e.message : 'Could not start the schedule', {
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
      {schedule ? 'Open schedule' : 'Build schedule'}
    </Button>
  );
};

const EmbeddedMatrix = () => {
  const record = useRecordContext<AvailabilityWindow>();
  if (!record?.id) return null;
  return <AvailabilityMatrix windowId={String(record.id)} />;
};

export const AvailabilityWindowShow = () => (
  <Show title="Availability window">
    <SimpleShowLayout>
      <WindowHeader />

      <FunctionField
        label="Roles for the schedule"
        render={(record: AvailabilityWindow) => <WindowRoleChips roles={record.roles} />}
      />

      <FunctionField
        label="Opened by"
        render={(record: AvailabilityWindow) =>
          record.openedBy ? `${record.openedBy.firstName} ${record.openedBy.lastName}` : '—'
        }
      />
      <DateField source="openedAt" label="Opened at" showTime />
      <FunctionField
        label="Closed by"
        render={(record: AvailabilityWindow) =>
          record.closedBy ? `${record.closedBy.firstName} ${record.closedBy.lastName}` : '—'
        }
      />
      <DateField source="closedAt" label="Closed at" showTime emptyText="—" />

      <Divider sx={{ my: 2 }} />

      <EmbeddedMatrix />
    </SimpleShowLayout>
  </Show>
);
