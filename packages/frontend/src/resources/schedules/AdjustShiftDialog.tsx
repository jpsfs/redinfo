import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { formatShiftLabel, ScheduleShiftBoard, shiftsOverlap, ShiftTimes } from '@redinfo/shared';
import { TimeField } from '../../components/TimeField';
import { apiFetch, ApiError } from '../../api';
import { apiErrorLabel } from '../../i18n/labels';
import { useT } from '../../i18n/useT';
import { formatDayLabel } from '../../utils/dates';

export interface AdjustShiftTarget {
  date: string;
  slot: number;
  shift: ScheduleShiftBoard;
  /** The day's other shifts, so an overlap can be caught before Save. */
  otherShiftsThatDay: ShiftTimes[];
}

/**
 * Moving one day's shift's hours for this schedule alone.
 *
 * The window's own grid — what availability was collected against — is never
 * touched here; this writes a correction the schedule alone carries. Reused
 * from the availability window editor: `TimeField` and the end-after-start /
 * no-overlap rules, so this dialog can never accept something the API would
 * refuse.
 */
export const AdjustShiftDialog = ({
  scheduleId,
  target,
  isPublished,
  onClose,
  onSaved,
}: {
  scheduleId: string;
  target: AdjustShiftTarget | null;
  isPublished: boolean;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const t = useT();
  const [startMinute, setStartMinute] = useState(0);
  const [endMinute, setEndMinute] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!target) return;
    setStartMinute(target.shift.startMinute);
    setEndMinute(target.shift.endMinute);
    setError(null);
  }, [target]);

  if (!target) return null;

  const overlap = target.otherShiftsThatDay.find((shift) =>
    shiftsOverlap({ startMinute, endMinute }, shift),
  );
  const validationError =
    endMinute <= startMinute
      ? t('adjustShift.errorEndBeforeStart')
      : overlap
        ? t('adjustShift.errorOverlaps', { label: formatShiftLabel(overlap) })
        : null;

  const url = `/schedules/${scheduleId}/shifts/${target.date}/${target.slot}`;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(url, { method: 'PUT', body: { startMinute, endMinute } });
      onSaved();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? apiErrorLabel(t, e)
          : e instanceof Error
            ? e.message
            : t('adjustShift.failed'),
      );
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(url, { method: 'DELETE' });
      onSaved();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? apiErrorLabel(t, e)
          : e instanceof Error
            ? e.message
            : t('adjustShift.failed'),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        {t('adjustShift.title')}
        <Typography variant="body2" color="text.secondary">
          {formatDayLabel(t, target.date)}
        </Typography>
      </DialogTitle>

      <DialogContent>
        {error && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {target.shift.adjustment && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {t('adjustShift.windowTimes', {
              label: formatShiftLabel(target.shift.adjustment.original),
            })}
          </Typography>
        )}

        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: validationError ? 1 : 0 }}>
          <TimeField
            ariaLabel={t('adjustShift.startAria')}
            value={startMinute}
            disabled={busy}
            onChange={setStartMinute}
          />
          <Typography color="text.secondary">–</Typography>
          <TimeField
            ariaLabel={t('adjustShift.endAria')}
            value={endMinute}
            isEnd
            disabled={busy}
            onChange={setEndMinute}
          />
        </Stack>

        {validationError && (
          <Typography variant="caption" color="error.main">
            {validationError}
          </Typography>
        )}

        {isPublished && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            {t('adjustShift.publishedWarning')}
          </Alert>
        )}
      </DialogContent>

      <DialogActions sx={{ justifyContent: 'space-between', px: 3, pb: 2 }}>
        {target.shift.adjustment ? (
          <Button
            size="small"
            color="secondary"
            startIcon={<RestartAltIcon />}
            onClick={() => void reset()}
            disabled={busy}
          >
            {t('adjustShift.reset')}
          </Button>
        ) : (
          <span />
        )}
        <Stack direction="row" spacing={1}>
          <Button onClick={onClose} disabled={busy}>
            {t('action.cancel')}
          </Button>
          <Button
            variant="contained"
            onClick={() => void save()}
            disabled={busy || Boolean(validationError)}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {t('adjustShift.save')}
          </Button>
        </Stack>
      </DialogActions>
    </Dialog>
  );
};
