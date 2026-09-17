import { ReactNode } from 'react';
import { Box, Card, CardContent, Typography } from '@mui/material';
import { colorSuccess, colorTextSecondary } from '../../layout/design-tokens';

export interface StatTileProps {
  label: string;
  value: string;
  unit?: string;
  /** Secondary line — a delta, a rank, a rate. */
  delta?: ReactNode;
  deltaTone?: 'up' | 'down' | 'neutral';
  children?: ReactNode;
}

/** One of the small tiles in a stat-tile row — a label, a big value, a delta line. */
export const StatTile = ({ label, value, unit, delta, deltaTone = 'neutral', children }: StatTileProps) => (
  <Card variant="outlined" elevation={0} sx={{ height: '100%' }}>
    <CardContent>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        {label}
      </Typography>
      <Typography variant="h4" component="div" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
        {value}
        {unit && (
          <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 0.5 }}>
            {unit}
          </Typography>
        )}
      </Typography>
      {delta && (
        <Typography
          variant="caption"
          sx={{ color: deltaTone === 'up' ? colorSuccess : colorTextSecondary, display: 'block', mt: 0.5 }}
        >
          {delta}
        </Typography>
      )}
      {children && <Box sx={{ mt: 1 }}>{children}</Box>}
    </CardContent>
  </Card>
);
