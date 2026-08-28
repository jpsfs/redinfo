import { Box, Stack, Typography } from '@mui/material';

export interface ChartLegendItem {
  key: string;
  label: string;
  color: string;
  /** When given, the legend also carries the value — for segments too narrow to label directly. */
  value?: string;
}

/** A swatch-plus-label row under a chart, optionally carrying each series' value. */
export const ChartLegend = ({ items }: { items: ChartLegendItem[] }) => (
  <Stack direction="row" flexWrap="wrap" gap={2} sx={{ mt: 1 }}>
    {items.map((item) => (
      <Stack key={item.key} direction="row" spacing={0.75} alignItems="center">
        <Box sx={{ width: 10, height: 10, borderRadius: '2px', bgcolor: item.color, flexShrink: 0 }} />
        <Typography variant="caption" color="text.secondary">
          {item.label}
        </Typography>
        {item.value && (
          <Typography variant="caption" sx={{ fontWeight: 600 }}>
            {item.value}
          </Typography>
        )}
      </Stack>
    ))}
  </Stack>
);
