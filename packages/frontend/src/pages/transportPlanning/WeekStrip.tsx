import { useEffect, useState } from 'react';
import { Alert, Box, ButtonBase, CircularProgress, Paper, Stack, Typography } from '@mui/material';
import { TripsWeekOverview } from '@redinfo/shared';
import { apiFetch, ApiError } from '../../api';
import { apiErrorLabel } from '../../i18n/labels';
import { useT } from '../../i18n/useT';
import { addIsoDays, weekdayAbbreviation } from '../../utils/dates';
import { ChipFilterRow } from '../../components/ChipFilterRow';

/** Monday of the ISO week `date` falls in — `Date#getUTCDay()`'s Sunday-first
 * convention shifted the same way `monthGrid` shifts it in `utils/dates.ts`. */
function mondayOf(date: string): string {
  const dayOfWeek = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return addIsoDays(date, -((dayOfWeek + 6) % 7));
}

/**
 * The board's week strip (#247 stage 6) — seven per-date summaries starting
 * at the Monday of `date`'s week, so a heavy day is visible before it lands
 * (`docs/plans/planeamento-transportes-redesign.md` §6/§8). Clicking a day
 * jumps the board to it, same as the mockup's "clicar num dia abre-o no
 * espaço de trabalho."
 */
export const WeekStrip = ({ date, onSelectDate }: { date: string; onSelectDate: (date: string) => void }) => {
  const t = useT();
  const from = mondayOf(date);
  const [overview, setOverview] = useState<TripsWeekOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiFetch<TripsWeekOverview>(`/trips/week?from=${from}`)
      .then((data) => {
        if (!cancelled) setOverview(data);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof ApiError ? apiErrorLabel(t, cause) : t('transportPlanning.weekStripLoadFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [from, t]);

  if (loading) {
    return (
      <Box sx={{ mb: 2 }}>
        <CircularProgress size={20} />
      </Box>
    );
  }
  if (error) {
    return (
      <Alert severity="warning" sx={{ mb: 2 }}>
        {error}
      </Alert>
    );
  }
  if (!overview) return null;

  const maxHours = Math.max(1, ...overview.days.map((day) => day.committedVehicleHours));

  return (
    // A single `minmax(0, 1fr)` grid column, not just `minWidth: 0` on the
    // `Paper` below — at desktop width `RaLayout-content` keeps
    // `min-width: auto` (`theme.ts` only relaxes it below `sm`, to protect
    // the docked sidebar), so a `minWidth: 0` inside this subtree is applied
    // too late once that ancestor has already grown to fit the strip's
    // seven-card row. See the fuller version of this comment on
    // `TransportPlanningPage`'s own timeline grid, which hits the same trap.
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', mb: 2 }}>
      <Paper variant="outlined" sx={{ p: 1, minWidth: 0 }}>
        <ChipFilterRow>
          {overview.days.map((day) => {
            const dayOfWeek = new Date(`${day.date}T00:00:00.000Z`).getUTCDay();
            const selected = day.date === date;
            return (
              <ButtonBase
                key={day.date}
                onClick={() => onSelectDate(day.date)}
                sx={{
                  width: 130,
                  textAlign: 'left',
                  display: 'block',
                  p: 1,
                  borderRadius: 1,
                  border: '1px solid',
                  borderColor: selected ? 'primary.main' : 'divider',
                  bgcolor: selected ? 'action.selected' : 'transparent',
                }}
              >
                <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                  {weekdayAbbreviation(t, dayOfWeek)} {day.date.slice(8, 10)}
                </Typography>
                <Typography variant="h6" sx={{ lineHeight: 1.2 }}>
                  {day.peopleCount}
                </Typography>
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="caption" color="text.secondary">
                    {t('transportPlanning.weekStripJourneys')}
                  </Typography>
                  <Typography variant="caption">{day.journeyCount}</Typography>
                </Stack>
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="caption" color={day.unplannedLegCount > 0 ? 'error.main' : 'text.secondary'}>
                    {t('transportPlanning.weekStripUnplanned')}
                  </Typography>
                  <Typography variant="caption" color={day.unplannedLegCount > 0 ? 'error.main' : 'text.primary'}>
                    {day.unplannedLegCount}
                  </Typography>
                </Stack>
                {day.outOfDistrictJourneyCount > 0 && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {t('transportPlanning.weekStripOutOfDistrict', { count: day.outOfDistrictJourneyCount })}
                  </Typography>
                )}
                <Box sx={{ height: 4, borderRadius: 2, bgcolor: 'action.hover', mt: 0.5, overflow: 'hidden' }}>
                  <Box
                    sx={{
                      height: '100%',
                      width: `${Math.min(100, (day.committedVehicleHours / maxHours) * 100)}%`,
                      bgcolor: 'primary.main',
                    }}
                  />
                </Box>
              </ButtonBase>
            );
          })}
        </ChipFilterRow>
      </Paper>
    </Box>
  );
};
