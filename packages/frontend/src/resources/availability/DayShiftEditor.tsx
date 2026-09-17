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
  ShiftSpec,
  sortShifts,
  toMinuteOfDay,
  validateDayShifts,
} from '@redinfo/shared';
import { TimeField } from '../../components/TimeField';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useT } from '../../i18n/useT';
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

/**
 * One shift's controls — start, end, vehicles, delete — shared between the
 * desktop table cell and the mobile day card so the two layouts can never
 * drift on what a shift row actually edits.
 */
const ShiftRow = ({
  day,
  shift,
  index,
  label,
  disabled,
  onUpdate,
  onRemove,
}: {
  day: WindowDayDraft;
  shift: ShiftSpec;
  index: number;
  label: string;
  disabled: boolean;
  onUpdate: (shifts: ShiftSpec[]) => void;
  onRemove: () => void;
}) => {
  const t = useT();
  return (
    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
      <TimeField
        ariaLabel={t('dayShift.startAria', { day: label, index: index + 1 })}
        value={shift.startMinute}
        disabled={disabled}
        onChange={(startMinute) =>
          onUpdate(
            day.shifts.map((candidate, position) =>
              position === index ? { ...candidate, startMinute } : candidate,
            ),
          )
        }
      />
      <Typography variant="body2" color="text.secondary">
        –
      </Typography>
      <TimeField
        ariaLabel={t('dayShift.endAria', { day: label, index: index + 1 })}
        value={shift.endMinute}
        isEnd
        disabled={disabled}
        onChange={(endMinute) =>
          onUpdate(
            day.shifts.map((candidate, position) =>
              position === index ? { ...candidate, endMinute } : candidate,
            ),
          )
        }
      />
      <VehiclesField
        ariaLabel={t('dayShift.vehiclesAria', { day: label, index: index + 1 })}
        value={shift.vehiclesNeeded}
        disabled={disabled}
        onChange={(vehiclesNeeded) =>
          onUpdate(
            day.shifts.map((candidate, position) =>
              position === index ? { ...candidate, vehiclesNeeded } : candidate,
            ),
          )
        }
      />
      <IconButton
        size="small"
        disabled={disabled}
        aria-label={t('dayShift.removeAria', { day: label, index: index + 1 })}
        onClick={onRemove}
      >
        <DeleteOutlineIcon fontSize="small" />
      </IconButton>
    </Stack>
  );
};

const DayTypeChip = ({ day }: { day: WindowDayDraft }) => {
  const t = useT();
  if (day.isHoliday) {
    return (
      <Chip
        size="small"
        color="warning"
        variant="outlined"
        label={
          day.holidayName
            ? t('dayType.holidayNamed', { name: day.holidayName })
            : t('dayType.holiday')
        }
      />
    );
  }
  if (day.isWeekend) return <Chip size="small" variant="outlined" label={t('dayType.weekend')} />;
  return <Chip size="small" variant="outlined" label={t('dayType.workday')} />;
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
  const t = useT();
  const isMobile = useIsMobile();
  const COPY_TARGETS: Array<{ target: CopyTarget; label: string }> = [
    { target: 'workdays', label: t('dayShift.copyWorkdays') },
    { target: 'nonWorkdays', label: t('dayShift.copyNonWorkdays') },
    { target: 'all', label: t('dayShift.copyAll') },
  ];
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
      {isMobile ? (
        <Stack spacing={1.5}>
          {days.map((day) => {
            const label = formatDayLabel(t, day.date);
            const error = validateDayShifts(day.shifts);

            return (
              <Paper
                key={day.date}
                variant="outlined"
                sx={{
                  p: 1.5,
                  backgroundColor: day.isHoliday
                    ? 'rgba(245,124,0,0.05)'
                    : day.isWeekend
                      ? 'rgba(0,0,0,0.015)'
                      : 'inherit',
                }}
              >
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {label}
                  </Typography>
                  <DayTypeChip day={day} />
                </Stack>

                {day.shifts.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    {t('dayShift.noShifts')}
                  </Typography>
                ) : (
                  <Stack spacing={0.75} sx={{ mb: 1 }}>
                    {day.shifts.map((shift, index) => (
                      <ShiftRow
                        // Index-keyed on purpose: rows are positional here, and
                        // the times themselves are what the user edits.
                        key={index}
                        day={day}
                        shift={shift}
                        index={index}
                        label={label}
                        disabled={disabled}
                        onUpdate={(shifts) => updateDay(day.date, shifts)}
                        onRemove={() =>
                          updateDay(
                            day.date,
                            day.shifts.filter((_, position) => position !== index),
                          )
                        }
                      />
                    ))}
                  </Stack>
                )}

                {error && (
                  <Typography variant="caption" color="error" sx={{ display: 'block', mb: 1 }}>
                    {error}
                  </Typography>
                )}

                <Stack direction="row" spacing={1}>
                  <Button
                    size="small"
                    startIcon={<AddIcon />}
                    disabled={disabled || day.shifts.length >= MAX_SHIFTS_PER_DAY}
                    aria-label={t('dayShift.addShiftAria', { day: label })}
                    onClick={() => addShift(day)}
                    sx={{ flex: 1 }}
                  >
                    {t('dayShift.addShift')}
                  </Button>
                  <Button
                    size="small"
                    startIcon={<ContentCopyIcon />}
                    disabled={disabled}
                    aria-label={t('dayShift.copyToAria', { day: label })}
                    onClick={(event) =>
                      setCopyFrom({ date: day.date, anchor: event.currentTarget })
                    }
                    sx={{ flex: 1 }}
                  >
                    {t('dayShift.copyToButton')}
                  </Button>
                </Stack>
              </Paper>
            );
          })}
        </Stack>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 520 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ minWidth: 210 }}>
                  <strong>{t('dayShift.colDay')}</strong>
                </TableCell>
                <TableCell>
                  <strong>{t('dayShift.colShifts')}</strong>
                  <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                    {t('dayShift.colShiftsHint')}
                  </Typography>
                </TableCell>
                <TableCell align="right" sx={{ minWidth: 190 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {days.map((day) => {
                const label = formatDayLabel(t, day.date);
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
                          {t('dayShift.noShifts')}
                        </Typography>
                      ) : (
                        <Stack spacing={0.75}>
                          {day.shifts.map((shift, index) => (
                            <ShiftRow
                              // Index-keyed on purpose: rows are positional
                              // here, and the times themselves are what the
                              // user edits.
                              key={index}
                              day={day}
                              shift={shift}
                              index={index}
                              label={label}
                              disabled={disabled}
                              onUpdate={(shifts) => updateDay(day.date, shifts)}
                              onRemove={() =>
                                updateDay(
                                  day.date,
                                  day.shifts.filter((_, position) => position !== index),
                                )
                              }
                            />
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
                          aria-label={t('dayShift.addShiftAria', { day: label })}
                          onClick={() => addShift(day)}
                        >
                          {t('dayShift.addShift')}
                        </Button>
                        <Button
                          size="small"
                          startIcon={<ContentCopyIcon />}
                          disabled={disabled}
                          aria-label={t('dayShift.copyToAria', { day: label })}
                          onClick={(event) =>
                            setCopyFrom({ date: day.date, anchor: event.currentTarget })
                          }
                        >
                          {t('dayShift.copyToButton')}
                        </Button>
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

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
