import { TextField } from '@mui/material';
import { MINUTES_PER_DAY, parseTimeOfDay, toTimeInputValue } from '@redinfo/shared';

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
export const TimeField = ({
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
