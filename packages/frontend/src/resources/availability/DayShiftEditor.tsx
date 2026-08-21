import { useState } from 'react';
import {
  Box,
  Button,
  Chip,
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import {
  DayType,
  DEFAULT_VEHICLES_NEEDED,
  MAX_SHIFTS_PER_DAY,
  MAX_VEHICLES_PER_SHIFT,
  MINUTES_PER_DAY,
  parseTimeOfDay,
  ShiftSpec,
  sortShifts,
  toMinuteOfDay,
  toTimeInputValue,
  validateDayShifts,
} from '@redinfo/shared';
import { formatDayLabel } from '../../utils/dates';

/** One day of the window being built. */
export interface WindowDayDraft {
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  isWeekend: boolean;
  isHoliday: boolean;
  holidayName?: string | null;
  shifts: ShiftSpec[];
}

/** Which days a "copy to…" action writes to. */
export type CopyTarget = 'workdays' | 'nonWorkdays' | 'all';

const COPY_TARGETS: Array<{ target: CopyTarget; label: string }> = [
  { target: 'workdays', label: 'All working days' },
  { target: 'nonWorkdays', label: 'All weekends & holidays' },
  { target: 'all', label: 'All days' },
];

export const isWorkday = (day: WindowDayDraft) => !day.isWeekend && !day.isHoliday;

export function dayTypeOf(day: WindowDayDraft): DayType {
  return day.isHoliday ? 'holiday' : day.isWeekend ? 'weekend' : 'workday';
}

/**
 * Copy one day's shifts onto every day in the chosen set.
 *
 * Exported and pure so the copy rule is testable without the table, and so
 * "all working days" can never mean something different from what the row
 * badges say.
 */
export function copyShiftsTo(
  days: WindowDayDraft[],
  sourceDate: string,
  target: CopyTarget,
): WindowDayDraft[] {
  const source = days.find((day) => day.date === sourceDate);
  if (!source) return days;

  const matches = (day: WindowDayDraft) => {
    if (target === 'all') return true;
    return target === 'workdays' ? isWorkday(day) : !isWorkday(day);
  };

  return days.map((day) =>
    matches(day)
      ? { ...day, shifts: source.shifts.map((shift) => ({ ...shift })) }
      : day,
  );
}

/** How many days a copy would write to, for the confirmation wording. */
export function countCopyTargets(days: WindowDayDraft[], target: CopyTarget): number {
  if (target === 'all') return days.length;
  return days.filter((day) => (target === 'workdays' ? isWorkday(day) : !isWorkday(day)))
    .length;
}

/**
 * One end of a shift, as a native time input.
 *
 * Native on purpose: `<input type="time">` gets the platform's own picker —
 * the scrolling wheel on a phone, keyboard entry on a desktop — which no custom
 * widget matches for a field this ordinary.
 *
 * A native picker cannot hold 24:00, so an end time shows midnight as 00:00 and
 * is read back as end-of-day. That is only ever the *end* of a shift: 00:00 as a
 * start time means exactly what it says.
 */
const TimeField = ({
  ariaLabel,
  value,
  isEnd = false,
  disabled,
  onChange,
}: {
  ariaLabel: string;
  value: number;
  isEnd?: boolean;
  disabled?: boolean;
  onChange: (minuteOfDay: number) => void;
}) => (
  <TextField
    type="time"
    size="small"
    value={toTimeInputValue(value)}
    disabled={disabled}
    onChange={(event) => {
      const parsed = parseTimeOfDay(event.target.value);
      // A half-typed or cleared field keeps the previous time: a shift is
      // removed with the delete button, not by emptying a field.
      if (parsed === null) return;
      onChange(isEnd && parsed === 0 ? MINUTES_PER_DAY : parsed);
    }}
    // step 60s is minute granularity — the point of moving off whole hours.
    inputProps={{ 'aria-label': ariaLabel, step: 60 }}
    sx={{ width: 124 }}
  />
);

/**
 * How many vehicles this shift needs crewed.
 *
 * It drives the coverage colours — a vehicle without a driver is not cover — so
 * it belongs next to the times rather than on a settings screen somewhere.
 */
const VehiclesField = ({
  ariaLabel,
  value,
  disabled,
  onChange,
}: {
  ariaLabel: string;
  value: number;
  disabled?: boolean;
  onChange: (vehiclesNeeded: number) => void;
}) => (
  <TextField
    type="number"
    size="small"
    value={value}
    disabled={disabled}
    onChange={(event) => {
      const parsed = Number(event.target.value);
      if (!Number.isFinite(parsed)) return;
      onChange(Math.max(0, Math.min(MAX_VEHICLES_PER_SHIFT, Math.trunc(parsed))));
    }}
    InputProps={{
      startAdornment: (
        <InputAdornment position="start">
          <DirectionsCarIcon fontSize="small" color="action" />
        </InputAdornment>
      ),
    }}
    inputProps={{
      'aria-label': ariaLabel,
      min: 0,
      max: MAX_VEHICLES_PER_SHIFT,
      step: 1,
    }}
    sx={{ width: 104 }}
  />
);

const DayTypeChip = ({ day }: { day: WindowDayDraft }) => {
  if (day.isHoliday) {
    return (
      <Chip
        size="small"
        color="warning"
        variant="outlined"
        label={day.holidayName ? `Holiday · ${day.holidayName}` : 'Holiday'}
      />
    );
  }
  if (day.isWeekend) return <Chip size="small" variant="outlined" label="Weekend" />;
  return <Chip size="small" variant="outlined" label="Workday" />;
};

/**
 * Per-day shift editor for a new availability window.
 *
 * Each day starts on the default grid and can be changed freely — add or remove
 * shifts, move their hours, or leave a day with none. The copy actions exist
 * because the common case is "the same pattern on every working day", which is
 * 20-odd identical edits otherwise.
 */
export const DayShiftEditor = ({
  days,
  onChange,
  disabled = false,
}: {
  days: WindowDayDraft[];
  onChange: (days: WindowDayDraft[]) => void;
  disabled?: boolean;
}) => {
  const [copyFrom, setCopyFrom] = useState<{ date: string; anchor: HTMLElement } | null>(
    null,
  );

  const updateDay = (date: string, shifts: ShiftSpec[]) => {
    onChange(days.map((day) => (day.date === date ? { ...day, shifts } : day)));
  };

  const addShift = (day: WindowDayDraft) => {
    // Start the new shift where the last one ended, so the common case (a run of
    // back-to-back shifts) needs no editing and never lands on an overlap.
    const last = sortShifts(day.shifts).at(-1);
    const startMinute = last
      ? Math.min(last.endMinute, MINUTES_PER_DAY - 60)
      : toMinuteOfDay(8);
    const endMinute = Math.min(startMinute + 4 * 60, MINUTES_PER_DAY);
    updateDay(day.date, [
      ...day.shifts,
      { startMinute, endMinute, vehiclesNeeded: DEFAULT_VEHICLES_NEEDED },
    ]);
  };

  const handleCopy = (target: CopyTarget) => {
    if (copyFrom) onChange(copyShiftsTo(days, copyFrom.date, target));
    setCopyFrom(null);
  };

  return (
    <>
      <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 520 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ minWidth: 210 }}>
                <strong>Day</strong>
              </TableCell>
              <TableCell>
                <strong>Shifts</strong>
                <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                  start, end and vehicles needed
                </Typography>
              </TableCell>
              <TableCell align="right" sx={{ minWidth: 190 }} />
            </TableRow>
          </TableHead>
          <TableBody>
            {days.map((day) => {
              const label = formatDayLabel(day.date);
              const error = validateDayShifts(day.shifts);

              return (
                <TableRow
                  key={day.date}
                  sx={{
                    backgroundColor: day.isHoliday
                      ? 'rgba(245,124,0,0.05)'
                      : day.isWeekend
                        ? 'rgba(0,0,0,0.015)'
                        : 'inherit',
                  }}
                >
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {label}
                    </Typography>
                    <Box sx={{ mt: 0.5 }}>
                      <DayTypeChip day={day} />
                    </Box>
                  </TableCell>

                  <TableCell>
                    {day.shifts.length === 0 ? (
                      <Typography variant="body2" color="text.secondary">
                        No shifts — nobody is asked to cover this day.
                      </Typography>
                    ) : (
                      <Stack spacing={0.75}>
                        {day.shifts.map((shift, index) => (
                          <Stack
                            // Index-keyed on purpose: rows are positional here,
                            // and the times themselves are what the user edits.
                            key={index}
                            direction="row"
                            spacing={1}
                            alignItems="center"
                            flexWrap="wrap"
                            useFlexGap
                          >
                            <TimeField
                              ariaLabel={`${label} shift ${index + 1} start`}
                              value={shift.startMinute}
                              disabled={disabled}
                              onChange={(startMinute) =>
                                updateDay(
                                  day.date,
                                  day.shifts.map((candidate, position) =>
                                    position === index
                                      ? { ...candidate, startMinute }
                                      : candidate,
                                  ),
                                )
                              }
                            />
                            <Typography variant="body2" color="text.secondary">
                              –
                            </Typography>
                            <TimeField
                              ariaLabel={`${label} shift ${index + 1} end`}
                              value={shift.endMinute}
                              isEnd
                              disabled={disabled}
                              onChange={(endMinute) =>
                                updateDay(
                                  day.date,
                                  day.shifts.map((candidate, position) =>
                                    position === index
                                      ? { ...candidate, endMinute }
                                      : candidate,
                                  ),
                                )
                              }
                            />
                            <VehiclesField
                              ariaLabel={`${label} shift ${index + 1} vehicles`}
                              value={shift.vehiclesNeeded}
                              disabled={disabled}
                              onChange={(vehiclesNeeded) =>
                                updateDay(
                                  day.date,
                                  day.shifts.map((candidate, position) =>
                                    position === index
                                      ? { ...candidate, vehiclesNeeded }
                                      : candidate,
                                  ),
                                )
                              }
                            />
                            <IconButton
                              size="small"
                              disabled={disabled}
                              aria-label={`Remove ${label} shift ${index + 1}`}
                              onClick={() =>
                                updateDay(
                                  day.date,
                                  day.shifts.filter((_, position) => position !== index),
                                )
                              }
                            >
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </Stack>
                        ))}
                      </Stack>
                    )}

                    {error && (
                      <Typography
                        variant="caption"
                        color="error"
                        sx={{ display: 'block', mt: 0.5 }}
                      >
                        {error}
                      </Typography>
                    )}
                  </TableCell>

                  <TableCell align="right">
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                      <Button
                        size="small"
                        startIcon={<AddIcon />}
                        disabled={disabled || day.shifts.length >= MAX_SHIFTS_PER_DAY}
                        aria-label={`Add a shift to ${label}`}
                        onClick={() => addShift(day)}
                      >
                        Add shift
                      </Button>
                      <Button
                        size="small"
                        startIcon={<ContentCopyIcon />}
                        disabled={disabled}
                        aria-label={`Copy ${label} shifts to other days`}
                        onClick={(event) =>
                          setCopyFrom({ date: day.date, anchor: event.currentTarget })
                        }
                      >
                        Copy to…
                      </Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <Menu
        open={copyFrom !== null}
        anchorEl={copyFrom?.anchor ?? null}
        onClose={() => setCopyFrom(null)}
      >
        {COPY_TARGETS.map(({ target, label }) => (
          <MenuItem key={target} onClick={() => handleCopy(target)}>
            {label} ({countCopyTargets(days, target)})
          </MenuItem>
        ))}
      </Menu>
    </>
  );
};
