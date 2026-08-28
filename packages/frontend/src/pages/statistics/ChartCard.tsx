import { ReactNode } from 'react';
import { Card, CardContent, Typography } from '@mui/material';

export interface ChartCardProps {
  title: string;
  subtitle?: ReactNode;
  footnote?: ReactNode;
  children: ReactNode;
}

/** One chart card: title, optional subtitle, the chart, an optional footnote below it. */
export const ChartCard = ({ title, subtitle, footnote, children }: ChartCardProps) => (
  <Card variant="outlined" elevation={0} sx={{ height: '100%' }}>
    <CardContent>
      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
        {title}
      </Typography>
      {subtitle && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          {subtitle}
        </Typography>
      )}
      {children}
      {footnote && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          {footnote}
        </Typography>
      )}
    </CardContent>
  </Card>
);
