import { useCallback, useEffect, useMemo, useState } from 'react';
import { Title, useCreate, useNotify, useRedirect } from 'react-admin';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import {
  AVAILABILITY_WINDOW_CATEGORIES,
  AvailabilityWindowCategory,
  availabilityWindowCategoryLabel,
  AvailabilityWindowOverlapsResponse,
  AVAILABILITY_WINDOW_CATEGORY_METADATA,
  DayShiftPattern,
  defaultRolesForCategory,
  MAX_WINDOW_DAYS,
  MAX_WINDOW_NAME_LENGTH,
  validateDayShifts,
  validateWindowRoles,
  WindowRoleSpec,
} from '@redinfo/shared';
import { apiFetch } from '../../api';
import { addIsoDays, formatDateRange, isoDateRange, toIsoDate } from '../../utils/dates';
import { DayShiftEditor, WindowDayDraft } from './DayShiftEditor';
import { WindowRoleEditor } from './WindowRoleEditor';

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
      pattern.shifts.map(({ startMinute, endMinute, vehiclesNeeded }) => ({
        startMinute,
        endMinute,
        vehiclesNeeded,
      })),
  }));
}

const describeWindows = (
  windows: AvailabilityWindowOverlapsResponse['open'],
): string =>
  windows
    .map((window) =>
      [window.name, formatDateRange(window.startDate, window.endDate)]
        .filter(Boolean)
        .join(', '),
    )
    .join('; ');

/**
 * Open an availability window, defining each day's shifts.
 *
 * Days are seeded from the default grid (one evening shift on workdays, two on
 * weekends and holidays) and then editable one by one, with copy actions for
 * the common "same pattern every working day" case. For a plain whole-month
 * emergency window on the defaults, the list screen has the one-click shortcut.
 */
export const AvailabilityWindowCreate = () => {
  const notify = useNotify();
  const redirect = useRedirect();
  const [create, { isPending: saving }] = useCreate();

  const [{ startDate, endDate }, setRange] = useState(defaultRange);
  const [category, setCategory] = useState<AvailabilityWindowCategory>(
    AvailabilityWindowCategory.EMERGENCY,
  );
  const [name, setName] = useState('');
  const [roles, setRoles] = useState<WindowRoleSpec[]>(() =>
    defaultRolesForCategory(AvailabilityWindowCategory.EMERGENCY),
  );
  // Whether the coordinator has touched the roles. Until they have, changing the
  // category re-seeds them from that category's defaults; after, their own list
  // stands — silently rewriting an edited crew would be worse than a stale one.
  const [rolesEdited, setRolesEdited] = useState(false);
  const [days, setDays] = useState<WindowDayDraft[]>([]);
  const [overlaps, setOverlaps] = useState<AvailabilityWindowOverlapsResponse | null>(null);
  const [checkingOverlaps, setCheckingOverlaps] = useState(true);
  const [acknowledged, setAcknowledged] = useState(false);
  const [loadingDays, setLoadingDays] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);

  const rangeError = useMemo(() => {
    if (!startDate || !endDate) return 'Pick a start and an end date.';
    if (endDate < startDate) return 'End date must be on or after the start date.';
    const length = isoDateRange(startDate, endDate).length;
    if (length > MAX_WINDOW_DAYS) {
      return `A window may span at most ${MAX_WINDOW_DAYS} days (this one spans ${length}).`;
    }
    return null;
  }, [startDate, endDate]);

  // Warn before saving rather than only on the rejected request: which windows
  // already cover these dates is exactly what decides whether to go ahead.
  useEffect(() => {
    if (rangeError) {
      setOverlaps(null);
      setCheckingOverlaps(false);
      return;
    }
    let cancelled = false;
    setCheckingOverlaps(true);
    setAcknowledged(false);
    apiFetch<AvailabilityWindowOverlapsResponse>(
      `/availability-windows/overlaps?category=${encodeURIComponent(
        category,
      )}&startDate=${startDate}&endDate=${endDate}`,
    )
      .then((result) => {
        if (!cancelled) setOverlaps(result);
      })
      .catch(() => {
        if (!cancelled) {
          setOverlaps(null);
          notify('Could not check for windows over these dates', { type: 'warning' });
        }
      })
      .finally(() => {
        if (!cancelled) setCheckingOverlaps(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, startDate, endDate, rangeError]);

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

  const roleError = useMemo(() => validateWindowRoles(roles), [roles]);

  const dayErrors = useMemo(
    () => days.filter((day) => validateDayShifts(day.shifts) !== null).length,
    [days],
  );

  const shiftCount = useMemo(
    () => days.reduce((total, day) => total + day.shifts.length, 0),
    [days],
  );

  const categoryLabel = availabilityWindowCategoryLabel(category);
  const openOverlaps = overlaps?.open ?? [];
  const closedOverlaps = overlaps?.closed ?? [];
  const needsAcknowledgement = openOverlaps.length === 0 && closedOverlaps.length > 0;

  const blocked =
    checkingOverlaps ||
    openOverlaps.length > 0 ||
    (needsAcknowledgement && !acknowledged) ||
    rangeError !== null ||
    roleError !== null ||
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
          category,
          name: name.trim() || undefined,
          // Sent even when empty: an empty list means "no roles", which is not
          // the same request as "give me the category defaults". Includes
          // requiredCertification as the editor left it — undefined (take the
          // name-derived suggestion), null (deliberately none), or a type.
          roles: roles.map((role) => ({
            name: role.name.trim(),
            maxPeople: role.maxPeople,
            requiredCertification: role.requiredCertification,
          })),
          acknowledgeOverlap: acknowledged || undefined,
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
  }, [
    acknowledged,
    category,
    create,
    days,
    endDate,
    name,
    notify,
    redirect,
    roles,
    startDate,
  ]);

  return (
    <Box sx={{ p: { xs: 1, sm: 2 } }}>
      <Title title="Open availability window" />

      <Card variant="outlined">
        <CardContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            Volunteers will be able to submit availability for every shift below. Days
            start on the default grid — one 20:00–24:00 shift on working days, and
            08:00–16:00 plus 16:00–24:00 on weekends and holidays, each needing one
            vehicle — and you can change any of it. Vehicles matter for coverage: a
            shift counts as covered only once every vehicle has a driver.
          </Alert>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
            <TextField
              select
              size="small"
              label="Category"
              value={category}
              onChange={(event) => {
                const next = event.target.value as AvailabilityWindowCategory;
                setCategory(next);
                if (!rolesEdited) setRoles(defaultRolesForCategory(next));
              }}
              SelectProps={{ native: true, inputProps: { 'aria-label': 'Category' } }}
              helperText={AVAILABILITY_WINDOW_CATEGORY_METADATA[category]?.description}
              InputLabelProps={{ shrink: true }}
              sx={{ minWidth: 200 }}
            >
              {AVAILABILITY_WINDOW_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {availabilityWindowCategoryLabel(value)}
                </option>
              ))}
            </TextField>
            <TextField
              size="small"
              label="Name (optional)"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={`${categoryLabel} - November`}
              helperText="Shown to volunteers alongside the dates. Need not be unique."
              inputProps={{ maxLength: MAX_WINDOW_NAME_LENGTH }}
              sx={{ flex: 1 }}
            />
          </Stack>

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

          {openOverlaps.length > 0 && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {`An availability window for ${categoryLabel} is already open over these ` +
                `dates (${describeWindows(openOverlaps)}). Close it first, or pick dates ` +
                'it does not cover. Windows of a different category may overlap freely.'}
            </Alert>
          )}

          {needsAcknowledgement && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              {`A closed availability window for ${categoryLabel} already covers these ` +
                `dates (${describeWindows(closedOverlaps)}). You can still open this ` +
                'one — check below if you meant to ask for the same dates again.'}
              <FormControlLabel
                sx={{ display: 'block', mt: 1 }}
                control={
                  <Checkbox
                    checked={acknowledged}
                    onChange={(event) => setAcknowledged(event.target.checked)}
                  />
                }
                label={`Open another ${categoryLabel} window over these dates`}
              />
            </Alert>
          )}

          {calendarError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {calendarError}
            </Alert>
          )}

          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2">Roles for the schedule</Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', mb: 1 }}
            >
              Volunteers are never asked which role they want — they say only when
              they can be there. These are the roles you will assign them to when
              building the schedule for this window.
            </Typography>
            <WindowRoleEditor
              roles={roles}
              onChange={(next) => {
                setRoles(next);
                setRolesEdited(true);
              }}
              disabled={saving}
            />
          </Box>

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
