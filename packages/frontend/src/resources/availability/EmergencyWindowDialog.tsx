import { useEffect, useMemo, useState } from 'react';
import { useNotify, useRefresh } from 'react-admin';
import {
  Alert,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  FormControlLabel,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  AvailabilityWindow,
  AvailabilityWindowCategory,
  AvailabilityWindowOverlapsResponse,
  DEFAULT_EMERGENCY_WINDOW_ROLES,
  emergencyWindowName,
  monthBounds,
  WindowRoleSpec,
} from '@redinfo/shared';
import { apiFetch } from '../../api';
import {
  addMonths,
  formatDateRange,
  isoDateRange,
  isoMonth,
  monthNames,
  toIsoDate,
} from '../../utils/dates';
import { WindowCategoryChip } from './WindowIdentity';

/** Next month, which is what an availability call almost always covers. */
export function defaultMonth(today: Date = new Date()): string {
  return addMonths(isoMonth(toIsoDate(today)), 1);
}

const YEARS_AHEAD = 2;

/** The crew this shortcut gives its window, named from the one shared list. */
const EMERGENCY_ROLES = DEFAULT_EMERGENCY_WINDOW_ROLES;

/** e.g. "Driver, Team Leader and Team Member". */
function describeRoles(roles: readonly WindowRoleSpec[]): string {
  const names = roles.map((role) => role.name);
  if (names.length < 2) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/**
 * Open a window covering a whole calendar month on the default shift grid.
 *
 * The point is speed: pick a month, confirm, done — no per-day editing, and the
 * category and name are settled by what this shortcut is for. For anything else
 * the full editor on "New availability window" applies.
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
  const [overlaps, setOverlaps] = useState<AvailabilityWindowOverlapsResponse | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  const years = useMemo(() => {
    const thisYear = today.getUTCFullYear();
    return Array.from({ length: YEARS_AHEAD + 2 }, (_, index) => thisYear - 1 + index);
  }, [today]);

  const bounds = useMemo(() => monthBounds(year, month), [year, month]);
  const dayCount = isoDateRange(bounds.startDate, bounds.endDate).length;
  const windowName = emergencyWindowName(month);

  // Which emergency windows already cover the month, so the coordinator sees it
  // before pressing the button rather than as a rejected request afterwards.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setAcknowledged(false);
    apiFetch<AvailabilityWindowOverlapsResponse>(
      `/availability-windows/overlaps?category=${AvailabilityWindowCategory.EMERGENCY}` +
        `&startDate=${bounds.startDate}&endDate=${bounds.endDate}`,
    )
      .then((result) => {
        if (!cancelled) setOverlaps(result);
      })
      .catch(() => {
        if (!cancelled) setOverlaps(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, bounds.startDate, bounds.endDate]);

  const openOverlaps = overlaps?.open ?? [];
  const closedOverlaps = overlaps?.closed ?? [];
  const needsAcknowledgement = openOverlaps.length === 0 && closedOverlaps.length > 0;

  const handleCreate = async () => {
    setSaving(true);
    setError(null);
    try {
      await apiFetch<AvailabilityWindow>('/availability-windows/month', {
        method: 'POST',
        body: { year, month, acknowledgeOverlap: acknowledged || undefined },
      });
      notify(
        `${windowName} opened for ${formatDateRange(bounds.startDate, bounds.endDate)}`,
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
        {/* One string rather than interpolated JSX, so the sentence is one text
            node: the crew is part of the prose, not a field beside it. */}
        <DialogContentText sx={{ mb: 2 }}>
          {'Opens a window covering a whole month, with the standard shifts: one ' +
            '20:00–24:00 shift on working days, and 08:00–16:00 plus 16:00–24:00 on ' +
            'weekends and holidays. Every shift asks for one vehicle, and the ' +
            `schedule is built from the standard crew — ${describeRoles(EMERGENCY_ROLES)}, ` +
            'one person each. To vary any of that, use the full editor instead.'}
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

        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 2 }} flexWrap="wrap" useFlexGap>
          <WindowCategoryChip category={AvailabilityWindowCategory.EMERGENCY} />
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {windowName}
          </Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {formatDateRange(bounds.startDate, bounds.endDate)} · {dayCount} days
        </Typography>

        {openOverlaps.length > 0 && (
          <Alert severity="error" sx={{ mt: 2 }}>
            An Emergency window is already open over this month. Close it before opening
            another one.
          </Alert>
        )}

        {needsAcknowledgement && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            A closed Emergency window already covers these dates.
            <FormControlLabel
              sx={{ display: 'block', mt: 1 }}
              control={
                <Checkbox
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                />
              }
              label="Ask for this month again anyway"
            />
          </Alert>
        )}

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
        <Button
          variant="contained"
          onClick={() => void handleCreate()}
          disabled={
            saving || openOverlaps.length > 0 || (needsAcknowledgement && !acknowledged)
          }
        >
          {saving ? <CircularProgress size={18} /> : 'Open window'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
