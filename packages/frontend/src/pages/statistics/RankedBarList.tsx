import { Box, Stack, Typography } from '@mui/material';
import { colorChartSingleSeries, colorGrey400 } from '../../layout/design-tokens';
import { useIsMobile } from '../../hooks/useIsMobile';

export interface RankedBarItem {
  key: string;
  label: string;
  value: number;
  /** The grouped "other" remainder — de-emphasised, not part of the ranking proper. */
  muted?: boolean;
}

export interface RankedBarListProps {
  items: RankedBarItem[];
  formatValue?: (value: number) => string;
}

/**
 * Single-series ranked bars — one colour for every bar (identity is already
 * shown by rank and label; colouring by magnitude would re-encode what the
 * bar length already shows). Desktop: label left, bar right. Mobile: label
 * and value on their own line, bar full-width beneath — the simpler
 * breakpoint-driven version of the design doc's measured-label switch (§7);
 * the exact longest-label measurement it describes is future work if a real
 * label turns out to collide.
 */
export const RankedBarList = ({ items, formatValue = String }: RankedBarListProps) => {
  const isMobile = useIsMobile();
  const max = Math.max(1, ...items.map((i) => i.value));

  return (
    <Stack spacing={1}>
      {items.map((item) => {
        const pct = Math.round((item.value / max) * 100);
        const color = item.muted ? colorGrey400 : colorChartSingleSeries;
        const bar = (
          <Box sx={{ flexGrow: 1, height: 14, bgcolor: 'action.hover', borderRadius: '4px', overflow: 'hidden' }}>
            <Box sx={{ width: `${pct}%`, height: '100%', bgcolor: color, borderRadius: '4px' }} />
          </Box>
        );
        const label = (
          <Typography variant="body2" sx={{ color: item.muted ? 'text.secondary' : 'text.primary' }}>
            {item.label}
          </Typography>
        );
        const value = (
          <Typography variant="body2" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
            {formatValue(item.value)}
          </Typography>
        );

        return isMobile ? (
          <Box key={item.key}>
            <Stack direction="row" justifyContent="space-between">
              {label}
              {value}
            </Stack>
            <Box sx={{ mt: 0.5 }}>{bar}</Box>
          </Box>
        ) : (
          <Stack key={item.key} direction="row" spacing={1.5} alignItems="center">
            <Box sx={{ width: '30%', minWidth: 0 }}>{label}</Box>
            {bar}
            <Box sx={{ width: 72, textAlign: 'right', flexShrink: 0 }}>{value}</Box>
          </Stack>
        );
      })}
    </Stack>
  );
};
