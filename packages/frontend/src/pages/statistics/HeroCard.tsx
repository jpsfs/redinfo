import { ReactNode } from 'react';
import { Card, CardContent, Stack, Typography } from '@mui/material';

export interface HeroCardProps {
  title: string;
  subtitle?: string;
  value: string;
  unit?: string;
  description: ReactNode;
}

/** The big hero number at the top of each tab — one per tab. */
export const HeroCard = ({ title, subtitle, value, unit, description }: HeroCardProps) => (
  <Card variant="outlined" elevation={0}>
    <CardContent>
      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
        {title}
      </Typography>
      {subtitle && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          {subtitle}
        </Typography>
      )}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1, sm: 3 }} alignItems={{ sm: 'center' }} sx={{ mt: 1 }}>
        <Typography variant="h2" component="div" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
          {value}
          {unit && (
            <Typography component="span" variant="h5" color="text.secondary" sx={{ ml: 0.5 }}>
              {unit}
            </Typography>
          )}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {description}
        </Typography>
      </Stack>
    </CardContent>
  </Card>
);
