import { Box } from '@mui/material';

export interface StackedBarSegment {
  key: string;
  value: number;
  color: string;
}

export interface StackedBarProps {
  segments: StackedBarSegment[];
  height?: number;
}

/**
 * One proportional horizontal bar, several colored segments — "hours by
 * activity type", the four response legs summed. Mark rules from
 * docs/plans/estatisticas-dashboards.md §6: rounded data-end corners, a 2px
 * surface gap between segments, nothing narrower than its share of the total.
 */
export const StackedBar = ({ segments, height = 28 }: StackedBarProps) => {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) return null;

  return (
    <Box sx={{ display: 'flex', width: '100%', height, borderRadius: 1, overflow: 'hidden', gap: '2px' }}>
      {segments
        .filter((s) => s.value > 0)
        .map((s) => (
          <Box
            key={s.key}
            sx={{ flexGrow: s.value, flexBasis: 0, bgcolor: s.color, minWidth: 2 }}
            title={s.key}
          />
        ))}
    </Box>
  );
};
