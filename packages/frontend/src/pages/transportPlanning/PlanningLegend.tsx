import { Box, Stack, Typography } from '@mui/material';
import { useT } from '../../i18n/useT';

const Swatch = ({ sx }: { sx: object }) => (
  <Box sx={{ width: 14, height: 8, borderRadius: 0.5, flexShrink: 0, ...sx }} />
);

/**
 * What the bands on a lane mean. The board draws five different things in the
 * same strip — a loaded leg, a return leg, empty running, a planned wait, and
 * a commitment from outside transport — and without a key the difference
 * between "the vehicle is busy" and "the vehicle is wasting a journey" is a
 * shade of grey nobody can be expected to remember.
 */
export const PlanningLegend = () => {
  const t = useT();
  const items = [
    { label: t('transportLeg.direction.OUTBOUND'), sx: { bgcolor: 'primary.main' } },
    { label: t('transportLeg.direction.RETURN'), sx: { bgcolor: 'secondary.main' } },
    {
      label: t('transportPlanning.emptyLegLabel'),
      sx: {
        bgcolor: 'grey.300',
        backgroundImage:
          'repeating-linear-gradient(45deg, rgba(0,0,0,0.18) 0, rgba(0,0,0,0.18) 2px, transparent 2px, transparent 6px)',
      },
    },
    { label: t('transportPlanning.dwellLabel'), sx: { bgcolor: 'warning.light' } },
    {
      label: t('transportPlanning.treatmentDurationLabel'),
      sx: { bgcolor: 'info.light', border: 1, borderColor: 'info.main' },
    },
    { label: t('transportPlanning.occupancyLegend.MAINTENANCE'), sx: { bgcolor: 'grey.500' } },
  ];

  return (
    <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap alignItems="center" sx={{ minWidth: 0 }}>
      {items.map((item) => (
        <Stack key={item.label} direction="row" spacing={0.5} alignItems="center">
          <Swatch sx={item.sx} />
          <Typography variant="caption" color="text.secondary" noWrap>
            {item.label}
          </Typography>
        </Stack>
      ))}
    </Stack>
  );
};
