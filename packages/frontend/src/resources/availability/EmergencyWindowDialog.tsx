import { useMemo, useState } from 'react';
import { useNotify, useRefresh } from 'react-admin';
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { AvailabilityWindow, monthBounds } from '@redinfo/shared';
import { apiFetch } from '../../api';
import {
  addMonths,
  formatDateRange,
  formatMonthLabel,
  isoDateRange,
  isoMonth,
  monthNames,
  toIsoDate,
} from '../../utils/dates';

/** Next month, which is what an availability call almost always covers. */
export function defaultMonth(today: Date = new Date()): string {
  return addMonths(isoMonth(toIsoDate(today)), 1);
}

const YEARS_AHEAD = 2;

/**
 * Open a window covering a whole calendar month on the default shift grid.
 *
 * The point is speed: pick a month, confirm, done — no per-day editing. For
 * anything else the full editor on "New availability window" applies.
 */
export const EmergencyWindowDialog = ({
  open,
  onClose,
  today = new Date(),
}: {
  open: boolean;
  onClose: () => void;
  /** Injectable so the default month is testable. */
  today?: Date;
}) => {
  const notify = useNotify();
  const refresh = useRefresh();

  const initial = defaultMonth(today);
  const [year, setYear] = useState(() => Number(initial.slice(0, 4)));
  const [month, setMonth] = useState(() => Number(initial.slice(5, 7)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const years = useMemo(() => {
    const thisYear = today.getUTCFullYear();
    return Array.from({ length: YEARS_AHEAD + 2 }, (_, index) => thisYear - 1 + index);
  }, [today]);

  const bounds = useMemo(() => monthBounds(year, month), [year, month]);
  const dayCount = isoDateRange(bounds.startDate, bounds.endDate).length;

  const handleCreate = async () => {
    setSaving(true);
    setError(null);
    try {
      await apiFetch<AvailabilityWindow>('/availability-windows/month', {
        method: 'POST',
        body: { year, month },
      });
      notify(
        `Availability window opened for ${formatMonthLabel(
          `${year}-${String(month).padStart(2, '0')}`,
        )}`,
        { type: 'success' },
      );
      onClose();
      // Back to the list, where the new window is the top row: no navigation,
      // so the coordinator stays where they were.
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open the window.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>New emergency availability</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          Opens a window covering a whole month, with the standard shifts: one
          20:00–24:00 shift on working days, and 08:00–16:00 plus 16:00–24:00 on
          weekends and holidays.
        </DialogContentText>

        <Stack direction="row" spacing={2}>
          <TextField
            select
            size="small"
            label="Month"
            value={month}
            onChange={(event) => setMonth(Number(event.target.value))}
            SelectProps={{ native: true, inputProps: { 'aria-label': 'Month' } }}
            sx={{ flex: 1 }}
            InputLabelProps={{ shrink: true }}
          >
            {monthNames().map((name, index) => (
              <option key={name} value={index + 1}>
                {name}
              </option>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Year"
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
            SelectProps={{ native: true, inputProps: { 'aria-label': 'Year' } }}
            sx={{ width: 120 }}
            InputLabelProps={{ shrink: true }}
          >
            {years.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </TextField>
        </Stack>

        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          {formatDateRange(bounds.startDate, bounds.endDate)} · {dayCount} days
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button variant="contained" onClick={() => void handleCreate()} disabled={saving}>
          {saving ? <CircularProgress size={18} /> : 'Open window'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
