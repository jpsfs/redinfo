import { useState } from 'react';
import {
  Box,
  Button,
  Chip,
  IconButton,
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
import {
  DayType,
  MAX_SHIFTS_PER_DAY,
  ShiftTimes,
  sortShifts,
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
  shifts: ShiftTimes[];
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

const pad = (hour: number) => String(hour).padStart(2, '0');

const hoursBetween = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, index) => from + index);

const HourSelect = ({
  ariaLabel,
  value,
  from,
  to,
  disabled,
  onChange,
}: {
  ariaLabel: string;
  value: number;
  from: number;
  to: number;
  disabled?: boolean;
  onChange: (hour: number) => void;
}) => (
  <TextField
    select
    size="small"
    value={value}
    disabled={disabled}
    onChange={(event) => onChange(Number(event.target.value))}
    SelectProps={{ native: true, inputProps: { 'aria-label': ariaLabel } }}
    sx={{ width: 96 }}
  >
    {hoursBetween(from, to).map((hour) => (
      <option key={hour} value={hour}>
        {pad(hour)}:00
      </option>
    ))}
  </TextField>
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

  const updateDay = (date: string, shifts: ShiftTimes[]) => {
    onChange(days.map((day) => (day.date === date ? { ...day, shifts } : day)));
  };

  const addShift = (day: WindowDayDraft) => {
    // Start the new shift after the last one, so the common case (a run of
    // back-to-back shifts) needs no editing and never lands on an overlap.
    const last = sortShifts(day.shifts).at(-1);
    const startHour = last ? Math.min(last.endHour, 23) : 8;
    const endHour = Math.min(startHour + 4, 24);
    updateDay(day.date, [...day.shifts, { startHour, endHour }]);
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
                          >
                            <HourSelect
                              ariaLabel={`${label} shift ${index + 1} start`}
                              value={shift.startHour}
                              from={0}
                              to={23}
                              disabled={disabled}
                              onChange={(startHour) =>
                                updateDay(
                                  day.date,
                                  day.shifts.map((candidate, position) =>
                                    position === index
                                      ? { ...candidate, startHour }
                                      : candidate,
                                  ),
                                )
                              }
                            />
                            <Typography variant="body2" color="text.secondary">
                              –
                            </Typography>
                            <HourSelect
                              ariaLabel={`${label} shift ${index + 1} end`}
                              value={shift.endHour}
                              from={1}
                              to={24}
                              disabled={disabled}
                              onChange={(endHour) =>
                                updateDay(
                                  day.date,
                                  day.shifts.map((candidate, position) =>
                                    position === index
                                      ? { ...candidate, endHour }
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
