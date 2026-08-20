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
import LockIcon from '@mui/icons-material/Lock';
import {
  AvailabilityMatrixResponse,
  AvailabilityWindow,
  AvailabilityWindowStatus,
} from '@redinfo/shared';
import { apiFetch } from '../../api';
import { formatDateRange } from '../../utils/dates';
import { AvailabilityMatrix } from './AvailabilityMatrix';
import { WindowStatusChip } from './AvailabilityWindowList';

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
            Submissions will no longer be accepted for{' '}
            {formatDateRange(record.startDate, record.endDate)} once this window is closed.
            This cannot be undone.
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
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="h6">
          {formatDateRange(record.startDate, record.endDate)}
        </Typography>
        <WindowStatusChip status={record.status} />
      </Box>
      <CloseWindowButton />
    </Box>
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
