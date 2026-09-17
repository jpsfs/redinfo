import { Box, BoxProps } from '@mui/material';

export interface ChipFilterRowProps extends BoxProps {
  /** Gap between chips, in theme spacing units. Default 1 (8px) — matches the `Stack spacing={1}` rows this replaces. */
  spacing?: number;
}

/**
 * A row of filter chips that scrolls horizontally instead of wrapping to a
 * new row when it overflows.
 *
 * Every filter-chip strip in the app (`EventReportList`'s type tabs,
 * `ScheduleList`'s category/status filters, `ReviewFilters`'s flag chips,
 * ...) used `flexWrap: 'wrap'`, which is fine on desktop but costs a full
 * extra row of vertical space per overflow on a phone. This scrolls that
 * overflow sideways instead, at a fixed one-row height on every viewport.
 * The scrollbar is hidden — the strip's own horizontal bleed past the
 * container edge is what signals it scrolls, the same discoverability any
 * horizontally-scrolling chip row relies on (App Store categories, GitHub
 * label pickers, ...).
 *
 * `minWidth: 0` on this box is necessary but not sufficient: a flex item
 * defaults to `min-width: auto`, which refuses to shrink below its content's
 * natural width, and with `flexWrap: 'nowrap'` that natural width is the sum
 * of every chip. Left alone, that doesn't just fail to clip locally — it
 * makes *this* box's own min-content equal its max-content, which bubbles
 * up through every ancestor flex container that also defaults to
 * `min-width: auto` (react-admin's `<Layout>` and `<List>` roots both are),
 * inflating the whole page's minimum width instead of just this row's (see
 * `ReviewFilters`'s pre-fix history, 424599d, for exactly that bug in
 * production). The `RaLayout`/`RaList` theme overrides in `theme.ts` close
 * that off at the source; this component only has to worry about its own
 * children.
 */
export const ChipFilterRow = ({ spacing = 1, sx, children, ...rest }: ChipFilterRowProps) => (
  <Box
    sx={[
      {
        display: 'flex',
        flexWrap: 'nowrap',
        alignItems: 'center',
        overflowX: 'auto',
        minWidth: 0,
        gap: spacing,
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
        '&::-webkit-scrollbar': { display: 'none' },
        '& > *': { flexShrink: 0 },
      },
      ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
    ]}
    {...rest}
  >
    {children}
  </Box>
);
