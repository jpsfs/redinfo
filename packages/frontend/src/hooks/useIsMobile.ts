import { useMediaQuery, useTheme } from '@mui/material';

/**
 * True on narrow viewports (below the `sm` breakpoint).
 *
 * The availability screens show the same data two ways — a dense table or
 * calendar on desktop, stacked day cards on mobile — and both read this hook so
 * the swap happens at one breakpoint rather than several.
 */
export function useIsMobile(): boolean {
  const theme = useTheme();
  return useMediaQuery(theme.breakpoints.down('sm'));
}
