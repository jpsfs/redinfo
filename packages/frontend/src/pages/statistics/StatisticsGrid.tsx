import { ReactNode } from 'react';
import { Box } from '@mui/material';

/** 12 columns desktop, 2 columns mobile (docs/plans/estatisticas-dashboards.md §7). */
export const StatisticsGrid = ({ children }: { children: ReactNode }) => (
  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(12, 1fr)' }, gap: 2, mt: 2 }}>
    {children}
  </Box>
);

export interface GridItemProps {
  /** Column span out of 12, desktop. */
  span: number;
  /** Column span out of 2, mobile — stat tiles pair up (1), every chart card spans both (2, the default). */
  mobileSpan?: 1 | 2;
  children: ReactNode;
}

export const GridItem = ({ span, mobileSpan = 2, children }: GridItemProps) => (
  <Box sx={{ gridColumn: { xs: `span ${mobileSpan}`, sm: `span ${span}` }, minWidth: 0 }}>{children}</Box>
);
