import { useCallback, useEffect, useMemo, useState } from 'react';
import { Title, useCreate, useNotify, useRedirect } from 'react-admin';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import {
  AvailabilityWindow,
  DayShiftPattern,
  MAX_WINDOW_DAYS,
  validateDayShifts,
} from '@redinfo/shared';
import { apiFetch } from '../../api';
import { addIsoDays, formatDateRange, isoDateRange, toIsoDate } from '../../utils/dates';
import { DayShiftEditor, WindowDayDraft } from './DayShiftEditor';

/** A fortnight from today, which is the usual shape of a window. */
function defaultRange(): { startDate: string; endDate: string } {
  const today = toIsoDate(new Date());
  return { startDate: today, endDate: addIsoDays(today, 13) };
}

function draftsFromCalendar(
  patterns: DayShiftPattern[],
  previous: WindowDayDraft[],
): WindowDayDraft[] {
  // Edits survive a change of dates: a day that was already on screen keeps the
  // shifts it was given, and only genuinely new days start from the default grid.
  const edited = new Map(previous.map((day) => [day.date, day.shifts]));
  return patterns.map((pattern) => ({
    date: pattern.date,
    isWeekend: pattern.isWeekend,
    isHoliday: pattern.isHoliday,
    holidayName: pattern.holidayName ?? null,
    shifts:
      edited.get(pattern.date) ??
      pattern.shifts.map(({ startHour, endHour }) => ({ startHour, endHour })),
  }));
}

/**
 * Open an availability window, defining each day's shifts.
 *
 * Days are seeded from the default grid (one evening shift on workdays, two on
 * weekends and holidays) and then editable one by one, with copy actions for
 * the common "same pattern every working day" case. For a plain whole-month
 * window on the defaults, the list screen has the one-click shortcut instead.
 */
export const AvailabilityWindowCreate = () => {
  const notify = useNotify();
  const redirect = useRedirect();
  const [create, { isPending: saving }] = useCreate();

  const [{ startDate, endDate }, setRange] = useState(defaultRange);
  const [days, setDays] = useState<WindowDayDraft[]>([]);
  const [activeWindow, setActiveWindow] = useState<AvailabilityWindow | null>(null);
  const [checkingActive, setCheckingActive] = useState(true);
  const [loadingDays, setLoadingDays] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<AvailabilityWindow | null>('/availability-windows/active')
      .then((window) => {
        if (!cancelled) setActiveWindow(window ?? null);
      })
      .catch(() => notify('Could not check for an open window', { type: 'warning' }))
      .finally(() => {
        if (!cancelled) setCheckingActive(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rangeError = useMemo(() => {
    if (!startDate || !endDate) return 'Pick a start and an end date.';
    if (endDate < startDate) return 'End date must be on or after the start date.';
    const length = isoDateRange(startDate, endDate).length;
    if (length > MAX_WINDOW_DAYS) {
      return `A window may span at most ${MAX_WINDOW_DAYS} days (this one spans ${length}).`;
    }
    return null;
  }, [startDate, endDate]);

  // The day types (and holiday names) come from the API, so the editor is
  // seeded with the same grid the backend would have applied on its own.
  useEffect(() => {
    if (rangeError) {
      setDays([]);
      return;
    }
    let cancelled = false;
    setLoadingDays(true);
    setCalendarError(null);
    apiFetch<DayShiftPattern[]>(
      `/availability/calendar?from=${startDate}&to=${endDate}`,
    )
      .then((patterns) => {
        if (cancelled) return;
        setDays((previous) => draftsFromCalendar(patterns, previous));
      })
      .catch((error) => {
        if (cancelled) return;
        setDays([]);
        setCalendarError(
          error instanceof Error ? error.message : 'Could not load the calendar.',
        );
      })
      .finally(() => {
        if (!cancelled) setLoadingDays(false);
      });
    return () => {
      cancelled = true;
    };
  }, [startDate, endDate, rangeError]);

  const dayErrors = useMemo(
    () => days.filter((day) => validateDayShifts(day.shifts) !== null).length,
    [days],
  );

  const shiftCount = useMemo(
    () => days.reduce((total, day) => total + day.shifts.length, 0),
    [days],
  );

  const blocked =
    checkingActive ||
    activeWindow !== null ||
    rangeError !== null ||
    loadingDays ||
    days.length === 0 ||
    dayErrors > 0;

  const handleSave = useCallback(() => {
    create(
      'availability-windows',
      {
        data: {
          startDate,
          endDate,
          days: days.map((day) => ({ date: day.date, shifts: day.shifts })),
        },
      },
      {
        onSuccess: () => {
          notify('Availability window opened', { type: 'success' });
          redirect('list', 'availability-windows');
        },
        onError: (error) =>
          notify(
            error instanceof Error ? error.message : 'Could not open the window',
            { type: 'error' },
          ),
      },
    );
  }, [create, days, endDate, notify, redirect, startDate]);

  return (
    <Box sx={{ p: { xs: 1, sm: 2 } }}>
      <Title title="Open availability window" />

      <Card variant="outlined">
        <CardContent>
          {checkingActive && <CircularProgress size={20} />}

          {!checkingActive && activeWindow && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              An availability window is already open (
              {formatDateRange(activeWindow.startDate, activeWindow.endDate)}). Close it
              before opening the next one.
            </Alert>
          )}

          {!checkingActive && !activeWindow && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Volunteers will be able to submit availability for every shift below. Days
              start on the default grid — one 20:00–24:00 shift on working days, and
              08:00–16:00 plus 16:00–24:00 on weekends and holidays — and you can change
              any of them.
            </Alert>
          )}

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
            <TextField
              type="date"
              size="small"
              label="Start date"
              value={startDate}
              onChange={(event) =>
                setRange((current) => ({ ...current, startDate: event.target.value }))
              }
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              type="date"
              size="small"
              label="End date"
              value={endDate}
              onChange={(event) =>
                setRange((current) => ({ ...current, endDate: event.target.value }))
              }
              InputLabelProps={{ shrink: true }}
            />
          </Stack>

          {rangeError && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              {rangeError}
            </Alert>
          )}

          {calendarError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {calendarError}
            </Alert>
          )}

          {loadingDays && <CircularProgress size={20} sx={{ mb: 2 }} />}

          {!rangeError && days.length > 0 && (
            <>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Shifts per day
              </Typography>
              <DayShiftEditor days={days} onChange={setDays} disabled={saving} />

              {dayErrors > 0 && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  {dayErrors === 1
                    ? 'One day has shifts that cannot be saved — see the message on that row.'
                    : `${dayErrors} days have shifts that cannot be saved — see the messages on those rows.`}
                </Alert>
              )}

              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  mt: 2,
                  flexWrap: 'wrap',
                }}
              >
                <Typography variant="body2" color="text.secondary" sx={{ mr: 'auto' }}>
                  {days.length} days · {shiftCount} shifts in total
                </Typography>
                <Button
                  variant="contained"
                  startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}
                  disabled={blocked || saving}
                  onClick={handleSave}
                >
                  Open window
                </Button>
              </Box>
            </>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};
