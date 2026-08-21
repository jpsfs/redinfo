import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import PublishIcon from '@mui/icons-material/Publish';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { ScheduleBoardResponse } from '@redinfo/shared';
import { apiFetch } from '../../api';
import { formatDateRange } from '../../utils/dates';
import { WindowIdentity } from '../availability/WindowIdentity';

const Line = ({
  icon,
  text,
  note,
}: {
  icon: React.ReactNode;
  text: string;
  note?: string;
}) => (
  <Stack direction="row" spacing={1.25} alignItems="center" sx={{ py: 0.5 }}>
    {icon}
    <Typography variant="body2" sx={{ fontWeight: 600 }}>
      {text}
    </Typography>
    {note && (
      <Typography variant="caption" color="text.secondary">
        {note}
      </Typography>
    )}
  </Stack>
);

/**
 * Confirming publication, with what is still missing said out loud.
 *
 * Gaps do not block it: rosters are routinely published part-filled and
 * finished by phone. Restating them here is the same courtesy the "close
 * window" confirmation pays — an irreversible-feeling action should say what it
 * is committing to.
 */
export const PublishDialog = ({
  scheduleId,
  open,
  board,
  onClose,
  onPublished,
}: {
  scheduleId: string;
  open: boolean;
  board: ScheduleBoardResponse;
  onClose: () => void;
  onPublished: () => void;
}) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const publish = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/schedules/${scheduleId}/publish`, { method: 'POST' });
      onPublished();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not publish the schedule.');
    } finally {
      setBusy(false);
    }
  };

  const { stats, conflicts } = board;
  const driverShort = board.days.reduce(
    (total, day) =>
      total +
      day.shifts.filter((shift) => shift.gaps.some((gap) => gap.kind === 'MISSING_DRIVER'))
        .length,
    0,
  );

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ pb: 1 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <PublishIcon color="primary" />
          <span>Publish schedule</span>
        </Stack>
        <Box sx={{ mt: 0.5 }}>
          <WindowIdentity category={board.window.category} name={board.window.name} />
        </Box>
        <Typography variant="body2" color="text.secondary">
          {formatDateRange(board.window.startDate, board.window.endDate)}
        </Typography>
      </DialogTitle>

      <DialogContent>
        {error && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Line
          icon={<CheckCircleOutlineIcon fontSize="small" sx={{ color: 'success.dark' }} />}
          text={`${stats.filledSlots} of ${stats.requiredSlots} slots filled`}
        />
        {stats.shiftsWithGaps > 0 && (
          <Line
            icon={<WarningAmberIcon fontSize="small" sx={{ color: 'error.dark' }} />}
            text={`${stats.shiftsWithGaps} shifts with gaps`}
            note={driverShort > 0 ? `${driverShort} without a driver` : undefined}
          />
        )}
        {stats.overrideCount > 0 && (
          <Line
            icon={<SwapHorizIcon fontSize="small" sx={{ color: 'warning.dark' }} />}
            text={`${stats.overrideCount} overrides`}
            note="agreed off-platform"
          />
        )}
        {conflicts.length > 0 && (
          <Line
            icon={<ErrorOutlineIcon fontSize="small" sx={{ color: 'error.dark' }} />}
            text={`${conflicts.length} double-booked`}
            note={conflicts[0].userName}
          />
        )}

        <Alert severity={stats.shiftsWithGaps > 0 ? 'warning' : 'info'} sx={{ mt: 2 }}>
          Publishing with gaps is allowed — the roster is often finished by phone.
          Assigned personnel see their duties straight away, and you can keep editing
          afterwards.
        </Alert>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={() => void publish()}
          disabled={busy}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          Publish
        </Button>
      </DialogActions>
    </Dialog>
  );
};
