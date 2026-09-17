import { ReactNode } from 'react';
import { Box, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { useT } from '../../../i18n/useT';

/**
 * The map column both journey-shaped pages sit beside their stop tables
 * (#247 stage 5) — collapsible the same way the board's own unassigned rail
 * is (`TransportPlanningPage`'s `railCollapsed`), mirrored rather than
 * copied outright: the rail sits on the board's left edge, so its own
 * collapse/expand chevrons point left/right; this column sits on the right
 * edge, so the chevrons point the other way — collapsing tucks it against
 * the right edge, expanding pulls it back out over the stop table.
 */
export function CollapsibleMapColumn({
  collapsed,
  onToggle,
  children,
}: {
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const t = useT();

  if (collapsed) {
    return (
      <Stack alignItems="center" sx={{ width: { xs: '100%', lg: 40 }, flexShrink: 0 }}>
        <Tooltip title={t('transportJourney.mapExpand')}>
          <IconButton size="small" aria-label={t('transportJourney.mapExpand')} onClick={onToggle}>
            <ChevronLeftIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
    );
  }

  return (
    <Box className="journey-page-map" sx={{ width: { xs: '100%', lg: 340 }, flexShrink: 0, minWidth: 0 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="subtitle1">{t('transportJourney.mapTitle')}</Typography>
        <Tooltip title={t('transportJourney.mapCollapse')}>
          <IconButton size="small" aria-label={t('transportJourney.mapCollapse')} onClick={onToggle}>
            <ChevronRightIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
      {children}
    </Box>
  );
}
