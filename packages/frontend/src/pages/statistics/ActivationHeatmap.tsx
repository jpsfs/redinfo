import { Box, Stack, Typography } from '@mui/material';
import { colorGrey100, colorSequentialScale } from '../../layout/design-tokens';
import { useIntlLocale } from '../../i18n/useIntlLocale';

export interface ActivationHeatmapProps {
  /** `weekday` follows `Date#getDay()` (0 = Sunday … 6 = Saturday); `band` is 0–5. */
  cells: { weekday: number; band: number; count: number }[];
  lessLabel: string;
  moreLabel: string;
}

/** Display order Monday → Sunday, whatever order the data arrives in. */
const DISPLAY_WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];
const BANDS = [0, 1, 2, 3, 4, 5];
/** Monday 2024-01-01 — an arbitrary real Monday, just for localized weekday names. */
const REFERENCE_MONDAY = new Date('2024-01-01T12:00:00.000Z');

/** Weekday × 4-hour-band grid — when emergencies actually happen, in Lisbon local time. */
export const ActivationHeatmap = ({ cells, lessLabel, moreLabel }: ActivationHeatmapProps) => {
  const locale = useIntlLocale();
  const byKey = new Map(cells.map((c) => [`${c.weekday}:${c.band}`, c.count]));
  const max = Math.max(1, ...cells.map((c) => c.count));

  const weekdayLabel = (weekday: number) => {
    const date = new Date(REFERENCE_MONDAY);
    date.setUTCDate(date.getUTCDate() + ((weekday + 6) % 7)); // Sunday(0) → +6, Monday(1) → +0, …
    return new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(date);
  };

  const colorFor = (count: number) => {
    if (count === 0) return colorGrey100;
    const step = Math.min(
      colorSequentialScale.length - 1,
      Math.round((count / max) * (colorSequentialScale.length - 1)),
    );
    return colorSequentialScale[Math.max(1, step)];
  };

  return (
    <Box>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: `56px repeat(${BANDS.length}, 1fr)`,
          gap: '2px',
        }}
      >
        <Box />
        {BANDS.map((band) => (
          <Typography key={band} variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>
            {String(band * 4).padStart(2, '0')}h
          </Typography>
        ))}
        {DISPLAY_WEEKDAYS.map((weekday) => (
          <Box key={weekday} sx={{ display: 'contents' }}>
            <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
              {weekdayLabel(weekday)}
            </Typography>
            {BANDS.map((band) => {
              const count = byKey.get(`${weekday}:${band}`) ?? 0;
              return (
                <Box
                  key={band}
                  title={`${count}`}
                  sx={{ bgcolor: colorFor(count), borderRadius: '2px', aspectRatio: '1 / 1' }}
                />
              );
            })}
          </Box>
        ))}
      </Box>
      <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 1 }}>
        <Typography variant="caption" color="text.secondary">
          {lessLabel}
        </Typography>
        {colorSequentialScale.map((color) => (
          <Box key={color} sx={{ width: 14, height: 8, bgcolor: color, borderRadius: '2px' }} />
        ))}
        <Typography variant="caption" color="text.secondary">
          {moreLabel}
        </Typography>
      </Stack>
    </Box>
  );
};
