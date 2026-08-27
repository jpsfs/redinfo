import { useCallback, useEffect, useMemo, useState } from 'react';
import { Title, useNotify } from 'react-admin';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  FormControlLabel,
  IconButton,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import FlagIcon from '@mui/icons-material/Flag';
import SaveIcon from '@mui/icons-material/Save';
import {
  AvailabilityEntry,
  AvailabilityWindow,
  availabilityWindowLabel,
  DayShiftPattern,
  formatShiftShortLabel,
  MyAvailabilityResponse,
  ShiftDefinition,
} from '@redinfo/shared';
import { apiFetch } from '../api';
import { useT } from '../i18n/useT';
import { WindowCategoryChip } from '../resources/availability/WindowIdentity';
import { useIsMobile } from '../hooks/useIsMobile';
import {
  addMonths,
  dayOfMonth,
  formatDateRange,
  formatDayLabel,
  formatMonthLabel,
  formatWeekRangeLabel,
  isoMonth,
  monthGrid,
  weekdayLabels,
  weekStartOf,
} from '../utils/dates';

/** Which shift slots the volunteer has ticked, per date. */
type Selection = Record<string, number[]>;

function selectionFromEntries(entries: AvailabilityEntry[]): Selection {
  return entries.reduce<Selection>((acc, entry) => {
    acc[entry.date] = [...entry.slots];
    return acc;
  }, {});
}

function selectionToEntries(selection: Selection): AvailabilityEntry[] {
  return Object.entries(selection)
    .filter(([, slots]) => slots.length > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, slots]) => ({ date, slots }));
}

function sameSelection(a: Selection, b: Selection): boolean {
  const key = (selection: Selection) =>
    JSON.stringify(
      selectionToEntries(selection).map((entry) => [
        entry.date,
        [...entry.slots].sort((x, y) => x - y),
      ]),
    );
  return key(a) === key(b);
}

// ─── Calendar (desktop) ────────────────────────────────────────────────────────

/**
 * Only the day-type colours: the shifts themselves are set per day when the
 * window is opened, so no fixed times can be spelled out here.
 */
const CalendarLegend = () => {
  const t = useT();
  return (
    <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ width: 10, height: 10, borderRadius: '3px', backgroundColor: 'grey.300' }} />
        <Typography variant="caption" color="text.secondary">
          {t('dayType.workday')}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ width: 10, height: 10, borderRadius: '3px', backgroundColor: 'warning.main' }} />
        <Typography variant="caption" color="text.secondary">
          {t('myAvailability.weekendHoliday')}
        </Typography>
      </Box>
      <Typography variant="caption" color="text.secondary">
        {t('myAvailability.legendHint')}
      </Typography>
    </Stack>
  );
};

const ShiftToggle = ({
  shift,
  date,
  checked,
  onToggle,
}: {
  shift: ShiftDefinition;
  date: string;
  checked: boolean;
  onToggle: () => void;
}) => {
  const t = useT();
  return (
    <Box
      component="button"
      type="button"
      onClick={onToggle}
      aria-pressed={checked}
      // The date belongs in the accessible name: a month of cells otherwise
      // exposes a dozen controls all called "20:00–24:00".
      aria-label={`${formatDayLabel(t, date)} ${shift.label}`}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        px: 0.75,
        py: 0.4,
        borderRadius: 1,
        fontSize: 11,
        fontWeight: 600,
        cursor: 'pointer',
        textAlign: 'left',
        border: '1.5px solid',
        borderColor: checked ? 'primary.main' : 'grey.400',
        backgroundColor: checked ? 'primary.main' : 'background.paper',
        color: checked ? 'primary.contrastText' : 'text.secondary',
      }}
    >
      <Box
        sx={{
          width: 14,
          height: 14,
          borderRadius: '3px',
          border: '1.5px solid currentColor',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {checked && <CheckIcon sx={{ fontSize: 10 }} />}
      </Box>
      {formatShiftShortLabel(shift)}
    </Box>
  );
};

const ReadOnlyShift = ({
  shift,
  available,
}: {
  shift: ShiftDefinition;
  available: boolean;
}) => (
  <Box
    sx={{
      display: 'flex',
      alignItems: 'center',
      gap: 0.5,
      px: 0.75,
      py: 0.4,
      borderRadius: 1,
      fontSize: 11,
      fontWeight: 600,
      backgroundColor: available ? '#E8F5E9' : 'grey.100',
      color: available ? '#2E7D32' : 'text.secondary',
    }}
  >
    {available && <CheckIcon sx={{ fontSize: 11 }} />}
    {formatShiftShortLabel(shift)}
  </Box>
);

const MonthCalendar = ({
  month,
  patterns,
  selection,
  editable,
  inWindow,
  onToggle,
  onMonthChange,
}: {
  month: string;
  patterns: Map<string, DayShiftPattern>;
  selection: Selection;
  editable: boolean;
  inWindow: (date: string) => boolean;
  onToggle: (date: string, slot: number) => void;
  onMonthChange: (month: string) => void;
}) => {
  const t = useT();
  const cells = useMemo(() => monthGrid(month), [month]);

  return (
    <Paper variant="outlined">
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          p: 1.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <IconButton
          size="small"
          aria-label={t('myAvailability.prevMonth')}
          onClick={() => onMonthChange(addMonths(month, -1))}
        >
          <ChevronLeftIcon />
        </IconButton>
        <Typography variant="subtitle1" sx={{ minWidth: 170, textAlign: 'center' }}>
          {formatMonthLabel(t, month)}
        </Typography>
        <IconButton
          size="small"
          aria-label={t('myAvailability.nextMonth')}
          onClick={() => onMonthChange(addMonths(month, 1))}
        >
          <ChevronRightIcon />
        </IconButton>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          backgroundColor: 'grey.50',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        {weekdayLabels(t).map((label) => (
          <Typography
            key={label}
            variant="caption"
            sx={{ p: 1, fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase' }}
          >
            {label}
          </Typography>
        ))}
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {cells.map((date) => {
          const pattern = patterns.get(date);
          const isInWindow = inWindow(date);
          const isCurrentMonth = isoMonth(date) === month;
          const selected = selection[date] ?? [];
          const canEdit = editable && isInWindow;

          return (
            <Box
              key={date}
              sx={{
                minHeight: 118,
                p: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: 0.75,
                borderRight: '1px solid',
                borderBottom: '1px solid',
                borderColor: 'grey.100',
                backgroundColor: !isInWindow
                  ? 'grey.50'
                  : pattern?.isHoliday
                    ? '#FFF8EE'
                    : pattern?.isWeekend
                      ? 'grey.50'
                      : 'background.paper',
                opacity: isCurrentMonth ? 1 : 0.55,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography
                  variant="caption"
                  sx={{ fontWeight: 700, color: isInWindow ? 'text.primary' : 'text.disabled' }}
                >
                  {dayOfMonth(date)}
                </Typography>
                {pattern?.isHoliday && (
                  <FlagIcon sx={{ fontSize: 13, color: 'warning.main' }} titleAccess={t('dayType.holiday')} />
                )}
              </Box>

              {pattern?.isHoliday && pattern.holidayName && (
                <Typography variant="caption" sx={{ fontSize: 10.5, color: '#B26A00', lineHeight: 1.3 }}>
                  {pattern.holidayName}
                </Typography>
              )}

              <Stack spacing={0.5} sx={{ mt: 'auto' }}>
                {canEdit &&
                  pattern?.shifts.map((shift) => (
                    <ShiftToggle
                      key={shift.slot}
                      shift={shift}
                      date={date}
                      checked={selected.includes(shift.slot)}
                      onToggle={() => onToggle(date, shift.slot)}
                    />
                  ))}

                {!canEdit && isInWindow &&
                  pattern?.shifts.map((shift) => (
                    <ReadOnlyShift
                      key={shift.slot}
                      shift={shift}
                      available={selected.includes(shift.slot)}
                    />
                  ))}

                {!isInWindow && pattern && (
                  <Typography variant="caption" sx={{ fontSize: 10.5, color: 'text.disabled' }}>
                    {pattern.shifts.map(formatShiftShortLabel).join(' · ')}
                  </Typography>
                )}
              </Stack>
            </Box>
          );
        })}
      </Box>
    </Paper>
  );
};

// ─── Day list (mobile) ─────────────────────────────────────────────────────────

/**
 * One row per day, always showing its shift(s) — no expand/collapse. Most
 * days carry exactly one shift, so that case gets a full-row switch (one tap
 * to answer); a day with several shifts falls back to a chip per shift.
 */
const rowSx = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 1,
  px: 1.5,
  py: 1.25,
  borderBottom: '1px solid',
  borderColor: 'divider',
  '&:last-of-type': { borderBottom: 0 },
} as const;

const DayMeta = ({ day }: { day: DayShiftPattern }) => {
  const t = useT();
  return (
    <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {formatDayLabel(t, day.date)}
      </Typography>
      {day.isHoliday && (
        <FlagIcon
          sx={{ fontSize: 14, color: 'warning.main' }}
          titleAccess={day.holidayName ?? t('dayType.holiday')}
        />
      )}
      {day.isWeekend && !day.isHoliday && (
        <Typography variant="caption" color="text.secondary">
          ({t('dayType.weekend')})
        </Typography>
      )}
    </Stack>
  );
};

const DayRow = ({
  day,
  selected,
  editable,
  onToggle,
}: {
  day: DayShiftPattern;
  selected: number[];
  editable: boolean;
  onToggle: (date: string, slot: number) => void;
}) => {
  const t = useT();

  if (day.shifts.length === 0) {
    return (
      <Box sx={rowSx}>
        <DayMeta day={day} />
        <Typography variant="caption" color="text.disabled">
          {t('myAvailability.noShiftsOnDay')}
        </Typography>
      </Box>
    );
  }

  if (editable && day.shifts.length === 1) {
    const shift = day.shifts[0];
    const checked = selected.includes(shift.slot);
    return (
      <Box
        component="button"
        type="button"
        onClick={() => onToggle(day.date, shift.slot)}
        role="switch"
        aria-checked={checked}
        aria-label={`${formatDayLabel(t, day.date)} ${shift.label}`}
        sx={{
          ...rowSx,
          width: '100%',
          border: 0,
          backgroundColor: 'transparent',
          cursor: 'pointer',
          textAlign: 'left',
          font: 'inherit',
        }}
      >
        <Box>
          <DayMeta day={day} />
          <Typography variant="caption" color="text.secondary">
            {shift.label}
          </Typography>
        </Box>
        {/* Purely visual: the surrounding button carries the click and the a11y state. */}
        <Switch checked={checked} tabIndex={-1} aria-hidden sx={{ pointerEvents: 'none' }} />
      </Box>
    );
  }

  return (
    <Box sx={{ ...rowSx, flexDirection: 'column', alignItems: 'stretch', gap: 0.75 }}>
      <DayMeta day={day} />
      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
        {day.shifts.map((shift) =>
          editable ? (
            <ShiftToggle
              key={shift.slot}
              shift={shift}
              date={day.date}
              checked={selected.includes(shift.slot)}
              onToggle={() => onToggle(day.date, shift.slot)}
            />
          ) : (
            <ReadOnlyShift key={shift.slot} shift={shift} available={selected.includes(shift.slot)} />
          ),
        )}
      </Stack>
    </Box>
  );
};

const WeekHeader = ({ label }: { label: string }) => (
  <Typography
    variant="overline"
    sx={{
      display: 'block',
      px: 1.5,
      py: 0.75,
      color: 'text.secondary',
      backgroundColor: 'grey.50',
      borderBottom: '1px solid',
      borderColor: 'divider',
    }}
  >
    {label}
  </Typography>
);

/** Consecutive days chunked Monday-to-Sunday, in the order they arrived. */
function groupByWeek(days: DayShiftPattern[]): DayShiftPattern[][] {
  const weeks = new Map<string, DayShiftPattern[]>();
  for (const day of days) {
    const key = weekStartOf(day.date);
    const week = weeks.get(key);
    if (week) week.push(day);
    else weeks.set(key, [day]);
  }
  return [...weeks.values()];
}

const DayList = ({
  days,
  selection,
  editable,
  onToggle,
}: {
  days: DayShiftPattern[];
  selection: Selection;
  editable: boolean;
  onToggle: (date: string, slot: number) => void;
}) => {
  const t = useT();
  const weeks = useMemo(() => groupByWeek(days), [days]);

  return (
    <Paper variant="outlined">
      {weeks.map((week) => (
        <Box key={week[0].date}>
          <WeekHeader label={formatWeekRangeLabel(t, week[0].date, week[week.length - 1].date)} />
          {week.map((day) => (
            <DayRow
              key={day.date}
              day={day}
              selected={selection[day.date] ?? []}
              editable={editable}
              onToggle={onToggle}
            />
          ))}
        </Box>
      ))}
    </Paper>
  );
};

// ─── Window picker ─────────────────────────────────────────────────────────────

/**
 * Which window is being answered.
 *
 * Several can be open at once — one per category — and the same day means
 * different things in each, so the choice has to be explicit. Only shown when
 * there is in fact a choice.
 */
const WindowPicker = ({
  windows,
  value,
  disabled,
  onChange,
}: {
  windows: AvailabilityWindow[];
  value: string;
  disabled?: boolean;
  onChange: (windowId: string) => void;
}) => {
  const t = useT();
  if (windows.length < 2) return null;

  return (
    <TextField
      select
      size="small"
      label={t('myAvailability.windowPickerLabel')}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      SelectProps={{
        native: true,
        inputProps: { 'aria-label': t('myAvailability.windowPickerLabel') },
      }}
      InputLabelProps={{ shrink: true }}
      sx={{ mb: 2, minWidth: 280, maxWidth: '100%' }}
    >
      {windows.map((window) => (
        <option key={window.id} value={window.id}>
          {availabilityWindowLabel(window)} ·{' '}
          {formatDateRange(t, window.startDate, window.endDate)}
        </option>
      ))}
    </TextField>
  );
};

// ─── Page ──────────────────────────────────────────────────────────────────────

/**
 * Volunteer self-service: declare availability per day and shift for the open
 * window, amend it until the window closes, or say "no availability this
 * window" outright.
 */
export const MyAvailabilityPage = () => {
  const t = useT();
  const isMobile = useIsMobile();
  const notify = useNotify();

  const [data, setData] = useState<MyAvailabilityResponse | null>(null);
  const [selection, setSelection] = useState<Selection>({});
  const [savedSelection, setSavedSelection] = useState<Selection>({});
  const [month, setMonth] = useState<string | null>(null);
  const [monthPatterns, setMonthPatterns] = useState<DayShiftPattern[]>([]);
  /** The window being answered; null until the API has picked a default. */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyResponse = useCallback((response: MyAvailabilityResponse) => {
    setData(response);
    setSelectedId(response.window?.id ?? null);
    const next = selectionFromEntries(response.entries);
    setSelection(next);
    setSavedSelection(next);
    setMonth(response.window ? isoMonth(response.window.startDate) : null);
  }, []);

  const load = useCallback(
    async (windowId?: string) => {
      setLoading(true);
      setError(null);
      try {
        const query = windowId ? `?windowId=${encodeURIComponent(windowId)}` : '';
        applyResponse(await apiFetch<MyAvailabilityResponse>(`/availability/me${query}`));
      } catch (e) {
        setError(e instanceof Error ? e.message : t('myAvailability.loadFailedNotify'));
      } finally {
        setLoading(false);
      }
    },
    [applyResponse, t],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // The calendar previews whole months, including days outside the window.
  // Passing the window makes the days it covers show *its* shifts; the rest
  // fall back to the default grid, so the month still reads as a calendar.
  const windowId = data?.window?.id ?? null;

  useEffect(() => {
    if (!month || isMobile) return;
    let cancelled = false;
    const cells = monthGrid(month);
    const windowParam = windowId ? `&windowId=${encodeURIComponent(windowId)}` : '';
    apiFetch<DayShiftPattern[]>(
      `/availability/calendar?from=${cells[0]}&to=${cells[cells.length - 1]}${windowParam}`,
    )
      .then((patterns) => {
        if (!cancelled) setMonthPatterns(patterns);
      })
      .catch(() => {
        if (!cancelled) setMonthPatterns([]);
      });
    return () => {
      cancelled = true;
    };
  }, [month, isMobile, windowId]);

  const patternsByDate = useMemo(
    () => new Map(monthPatterns.map((pattern) => [pattern.date, pattern])),
    [monthPatterns],
  );

  const window = data?.window ?? null;
  const canSubmit = data?.canSubmit ?? false;
  const declined = data?.declined ?? false;
  const editable = canSubmit && !declined;
  const dirty = !sameSelection(selection, savedSelection);

  const inWindow = useCallback(
    (date: string) => !!window && date >= window.startDate && date <= window.endDate,
    [window],
  );

  const handleToggle = useCallback((date: string, slot: number) => {
    setSelection((current) => {
      const existing = current[date] ?? [];
      const next = existing.includes(slot)
        ? existing.filter((candidate) => candidate !== slot)
        : [...existing, slot];
      return { ...current, [date]: next };
    });
  }, []);

  // `data.calendar` is already scoped to the window in play, so a bulk action
  // never reaches outside it.
  const calendarDays = data?.calendar ?? [];

  const handleSetAll = useCallback(
    (available: boolean) => {
      setSelection((current) => {
        const next = { ...current };
        for (const day of calendarDays) {
          next[day.date] = available ? day.shifts.map((shift) => shift.slot) : [];
        }
        return next;
      });
    },
    [calendarDays],
  );

  // Shifts, not days: a day with two shifts only half-answered should read as
  // half-answered, not as a fully ticked day.
  const shiftsSummary = useMemo(() => {
    let total = 0;
    let selected = 0;
    for (const day of calendarDays) {
      total += day.shifts.length;
      const picked = selection[day.date] ?? [];
      selected += day.shifts.filter((shift) => picked.includes(shift.slot)).length;
    }
    return { selected, total };
  }, [calendarDays, selection]);

  const handleSave = async () => {
    setSaving(true);
    try {
      applyResponse(
        await apiFetch<MyAvailabilityResponse>('/availability/me', {
          method: 'PUT',
          // Always explicit: with more than one window open the API refuses to
          // guess, and rightly so.
          body: { windowId: selectedId, entries: selectionToEntries(selection) },
        }),
      );
      notify(t('myAvailability.savedNotify'), { type: 'success' });
    } catch (e) {
      notify(e instanceof Error ? e.message : t('myAvailability.saveFailedNotify'), {
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeclineToggle = async (nextDeclined: boolean) => {
    setSaving(true);
    try {
      const query = selectedId ? `?windowId=${encodeURIComponent(selectedId)}` : '';
      applyResponse(
        await apiFetch<MyAvailabilityResponse>(`/availability/me/decline${query}`, {
          method: nextDeclined ? 'POST' : 'DELETE',
        }),
      );
      notify(
        nextDeclined
          ? t('myAvailability.declinedNotify')
          : t('myAvailability.undeclinedNotify'),
        { type: 'info' },
      );
    } catch (e) {
      notify(e instanceof Error ? e.message : t('myAvailability.declineFailedNotify'), {
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <Title title={t('myAvailability.pageTitle')} />
        <CircularProgress size={24} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      <Title title={t('myAvailability.pageTitle')} />

      <Box sx={{ mb: 2 }}>
        <Typography variant="h5">{t('myAvailability.heading')}</Typography>
        {window && (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
            <Chip
              size="small"
              variant="outlined"
              color={canSubmit ? 'success' : 'default'}
              label={canSubmit ? t('myAvailability.windowOpenChip') : t('myAvailability.windowClosedChip')}
            />
            <WindowCategoryChip category={window.category} />
            {window.name && (
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {window.name}
              </Typography>
            )}
            <Typography variant="body2" color="text.secondary">
              {formatDateRange(t, window.startDate, window.endDate)}
            </Typography>
          </Stack>
        )}
      </Box>

      <WindowPicker
        windows={data?.windows ?? []}
        value={selectedId ?? ''}
        disabled={saving}
        onChange={(id) => void load(id)}
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {!window && (
        <Card variant="outlined">
          <CardContent sx={{ textAlign: 'center', py: 6 }}>
            <EventBusyIcon sx={{ fontSize: 48, color: 'grey.400', mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              {t('myAvailability.noWindowHeading')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('myAvailability.noWindowBody')}
            </Typography>
          </CardContent>
        </Card>
      )}

      {window && canSubmit && (
        <Card variant="outlined" sx={{ mb: 2 }}>
          <CardContent sx={{ py: 1.5 }}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={declined}
                  disabled={saving}
                  onChange={(event) => void handleDeclineToggle(event.target.checked)}
                />
              }
              label={
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {t('myAvailability.noAvailabilityLabel')}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {t('myAvailability.noAvailabilityHint', {
                      dates: formatDateRange(t, window.startDate, window.endDate),
                    })}
                  </Typography>
                </Box>
              }
            />
          </CardContent>
        </Card>
      )}

      {window && declined && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {t('myAvailability.declinedHeading')}
          </Typography>
          <Typography variant="body2">
            {t('myAvailability.declinedBody')}
          </Typography>
        </Alert>
      )}

      {window && !declined && canSubmit && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {t('myAvailability.canSubmitInfo', {
            dates: formatDateRange(t, window.startDate, window.endDate),
          })}
        </Alert>
      )}

      {window && !canSubmit && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {t('myAvailability.closedInfo')}
        </Alert>
      )}

      {window && !declined && (
        <>
          {!isMobile && <CalendarLegend />}

          {isMobile ? (
            <>
              {editable && (
                <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
                  <Button size="small" variant="outlined" onClick={() => handleSetAll(true)}>
                    {t('myAvailability.markAllLabel')}
                  </Button>
                  <Button size="small" variant="outlined" onClick={() => handleSetAll(false)}>
                    {t('myAvailability.clearAllLabel')}
                  </Button>
                </Stack>
              )}
              <DayList
                days={calendarDays}
                selection={selection}
                editable={editable}
                onToggle={handleToggle}
              />
            </>
          ) : (
            month && (
              <MonthCalendar
                month={month}
                patterns={patternsByDate}
                selection={selection}
                editable={editable}
                inWindow={inWindow}
                onToggle={handleToggle}
                onMonthChange={setMonth}
              />
            )
          )}

          {editable && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: 2,
                mt: 2,
                flexWrap: 'wrap',
                // On mobile the list can run long: pin the summary and Save
                // to the bottom of the viewport rather than the end of the scroll.
                ...(isMobile && {
                  position: 'sticky',
                  bottom: 0,
                  backgroundColor: 'background.paper',
                  borderTop: '1px solid',
                  borderColor: 'divider',
                  mx: -2,
                  px: 2,
                  py: 1.5,
                }),
              }}
            >
              <Typography variant="body2" color="text.secondary" sx={{ mr: 'auto' }}>
                {isMobile
                  ? t('myAvailability.shiftsSummary', {
                      selected: shiftsSummary.selected,
                      total: shiftsSummary.total,
                    })
                  : t('myAvailability.saveHint')}
              </Typography>
              <Button
                variant="contained"
                startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}
                onClick={() => void handleSave()}
                disabled={saving || !dirty}
              >
                {t('myAvailability.saveButton')}
              </Button>
            </Box>
          )}
        </>
      )}
    </Box>
  );
};
