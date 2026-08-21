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
  Collapse,
  Divider,
  FormControlLabel,
  IconButton,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
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
import { WindowCategoryChip } from '../resources/availability/WindowIdentity';
import { useIsMobile } from '../hooks/useIsMobile';
import {
  addMonths,
  dayOfMonth,
  formatDateRange,
  formatDayLabel,
  formatMonthLabel,
  isoMonth,
  monthGrid,
  weekdayLabels,
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
const CalendarLegend = () => (
  <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Box sx={{ width: 10, height: 10, borderRadius: '3px', backgroundColor: 'grey.300' }} />
      <Typography variant="caption" color="text.secondary">
        Workday
      </Typography>
    </Box>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Box sx={{ width: 10, height: 10, borderRadius: '3px', backgroundColor: 'warning.main' }} />
      <Typography variant="caption" color="text.secondary">
        Weekend / holiday
      </Typography>
    </Box>
    <Typography variant="caption" color="text.secondary">
      Each day shows the shifts your coordinator set for it.
    </Typography>
  </Stack>
);

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
}) => (
  <Box
    component="button"
    type="button"
    onClick={onToggle}
    aria-pressed={checked}
    // The date belongs in the accessible name: a month of cells otherwise
    // exposes a dozen controls all called "20:00–24:00".
    aria-label={`${formatDayLabel(date)} ${shift.label}`}
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
          aria-label="Previous month"
          onClick={() => onMonthChange(addMonths(month, -1))}
        >
          <ChevronLeftIcon />
        </IconButton>
        <Typography variant="subtitle1" sx={{ minWidth: 170, textAlign: 'center' }}>
          {formatMonthLabel(month)}
        </Typography>
        <IconButton
          size="small"
          aria-label="Next month"
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
        {weekdayLabels().map((label) => (
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
                  <FlagIcon sx={{ fontSize: 13, color: 'warning.main' }} titleAccess="Holiday" />
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

// ─── Day cards (mobile) ────────────────────────────────────────────────────────

const DayAgenda = ({
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
  const [expanded, setExpanded] = useState<string | null>(days[0]?.date ?? null);

  return (
    <Stack spacing={1}>
      {days.map((day) => {
        const selected = selection[day.date] ?? [];
        const isExpanded = expanded === day.date;
        const summary =
          selected.length === 0
            ? 'Not selected'
            : selected.length === day.shifts.length
              ? 'All shifts'
              : `${selected.length} of ${day.shifts.length}`;

        return (
          <Card key={day.date} variant="outlined">
            <CardContent>
              <Box
                onClick={() => setExpanded(isExpanded ? null : day.date)}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 1,
                  cursor: 'pointer',
                }}
              >
                <Box>
                  <Typography variant="subtitle2">{formatDayLabel(day.date)}</Typography>
                  <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }} flexWrap="wrap" useFlexGap>
                    {day.isHoliday && (
                      <Chip
                        size="small"
                        color="warning"
                        variant="outlined"
                        label={day.holidayName ?? 'Holiday'}
                      />
                    )}
                    {day.isWeekend && !day.isHoliday && (
                      <Chip size="small" variant="outlined" label="Weekend" />
                    )}
                    {!isExpanded && (
                      <Chip
                        size="small"
                        variant="outlined"
                        color={selected.length ? 'success' : 'default'}
                        label={summary}
                      />
                    )}
                  </Stack>
                </Box>
                <IconButton size="small" aria-label={isExpanded ? 'Collapse' : 'Expand'}>
                  {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                </IconButton>
              </Box>

              <Collapse in={isExpanded} unmountOnExit>
                <Stack sx={{ mt: 1 }} divider={<Divider flexItem />}>
                  {day.shifts.length === 0 && (
                    <Typography variant="body2" color="text.secondary" sx={{ py: 0.5 }}>
                      No shifts on this day.
                    </Typography>
                  )}
                  {day.shifts.map((shift) => (
                    <Box
                      key={shift.slot}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        py: 0.5,
                      }}
                    >
                      <Typography variant="body2">{shift.label}</Typography>
                      {editable ? (
                        <Checkbox
                          checked={selected.includes(shift.slot)}
                          onChange={() => onToggle(day.date, shift.slot)}
                          inputProps={{
                            'aria-label': `${formatDayLabel(day.date)} ${shift.label}`,
                          }}
                        />
                      ) : (
                        <ReadOnlyShift
                          shift={shift}
                          available={selected.includes(shift.slot)}
                        />
                      )}
                    </Box>
                  ))}
                </Stack>
              </Collapse>
            </CardContent>
          </Card>
        );
      })}
    </Stack>
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
  if (windows.length < 2) return null;

  return (
    <TextField
      select
      size="small"
      label="Availability window"
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      SelectProps={{
        native: true,
        inputProps: { 'aria-label': 'Availability window' },
      }}
      InputLabelProps={{ shrink: true }}
      sx={{ mb: 2, minWidth: 280, maxWidth: '100%' }}
    >
      {windows.map((window) => (
        <option key={window.id} value={window.id}>
          {availabilityWindowLabel(window)} ·{' '}
          {formatDateRange(window.startDate, window.endDate)}
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
        setError(e instanceof Error ? e.message : 'Could not load your availability.');
      } finally {
        setLoading(false);
      }
    },
    [applyResponse],
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
      notify('Availability saved', { type: 'success' });
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not save your availability', {
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
          ? 'Your coordinator has been told you are not available this window'
          : 'You can select your shifts again',
        { type: 'info' },
      );
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not update your response', {
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <Title title="My availability" />
        <CircularProgress size={24} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      <Title title="My availability" />

      <Box sx={{ mb: 2 }}>
        <Typography variant="h5">My availability</Typography>
        {window && (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
            <Chip
              size="small"
              variant="outlined"
              color={canSubmit ? 'success' : 'default'}
              label={canSubmit ? 'Window open' : 'Window closed'}
            />
            <WindowCategoryChip category={window.category} />
            {window.name && (
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {window.name}
              </Typography>
            )}
            <Typography variant="body2" color="text.secondary">
              {formatDateRange(window.startDate, window.endDate)}
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
              No availability window is currently open
            </Typography>
            <Typography variant="body2" color="text.secondary">
              A coordinator will open the next availability window here. Check back soon —
              you&apos;ll be able to submit your availability for each day and shift once it
              opens.
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
                    I have no availability this window
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Let your coordinator know you can&apos;t take any shifts between{' '}
                    {formatDateRange(window.startDate, window.endDate)}, instead of leaving
                    every day unanswered.
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
            You&apos;ve told us you&apos;re not available this window
          </Typography>
          <Typography variant="body2">
            Your coordinator can see this. If that changes before the window closes, uncheck
            the box above and select your available shifts.
          </Typography>
        </Alert>
      )}

      {window && !declined && canSubmit && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Select the shifts you can cover. You can amend anytime before the window closes —
          only days between {formatDateRange(window.startDate, window.endDate)} are open for
          submission.
        </Alert>
      )}

      {window && !canSubmit && (
        <Alert severity="info" sx={{ mb: 2 }}>
          This window is closed. Showing your final submissions for reference — no further
          changes can be made.
        </Alert>
      )}

      {window && !declined && (
        <>
          {!isMobile && <CalendarLegend />}

          {isMobile ? (
            <DayAgenda
              days={data?.calendar ?? []}
              selection={selection}
              editable={editable}
              onToggle={handleToggle}
            />
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
              }}
            >
              <Typography variant="body2" color="text.secondary" sx={{ mr: 'auto' }}>
                Changes are saved for the whole window at once.
              </Typography>
              <Button
                variant="contained"
                startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}
                onClick={() => void handleSave()}
                disabled={saving || !dirty}
              >
                Save availability
              </Button>
            </Box>
          )}
        </>
      )}
    </Box>
  );
};
