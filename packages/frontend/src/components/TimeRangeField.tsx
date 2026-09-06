import { Stack, Typography } from '@mui/material';
import { formatMinutes, minutesBetweenTimes } from '@redinfo/shared';
import { TimeField } from './TimeField';
import { useT } from '../i18n/useT';

/**
 * A start/end pair for a manual volunteer-hours entry, replacing a raw
 * minutes field with the times a person actually remembers ("19:00 to
 * 21:00") — built from the same `TimeField` a shift's own start/end already
 * uses, so past-midnight handling (`isEnd`) and the native picker come for
 * free. Always controlled with concrete times: a caller editing an entry
 * logged before this field existed picks a default span (see
 * `MyHoursPage`'s `editFormFor`) rather than leaving this blank.
 */
export const TimeRangeField = ({
  startMinute,
  endMinute,
  onChange,
  disabled,
}: {
  startMinute: number;
  endMinute: number;
  onChange: (span: { startMinute: number; endMinute: number; minutes: number }) => void;
  disabled?: boolean;
}) => {
  const t = useT();
  const minutes = minutesBetweenTimes(startMinute, endMinute);
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <TimeField
        ariaLabel={t('timeRangeField.startAria')}
        value={startMinute}
        disabled={disabled}
        onChange={(value) =>
          onChange({ startMinute: value, endMinute, minutes: minutesBetweenTimes(value, endMinute) })
        }
      />
      <Typography variant="body2" color="text.secondary">
        –
      </Typography>
      <TimeField
        ariaLabel={t('timeRangeField.endAria')}
        value={endMinute}
        isEnd
        disabled={disabled}
        onChange={(value) =>
          onChange({ startMinute, endMinute: value, minutes: minutesBetweenTimes(startMinute, value) })
        }
      />
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 56 }}>
        {formatMinutes(minutes)}
      </Typography>
    </Stack>
  );
};
