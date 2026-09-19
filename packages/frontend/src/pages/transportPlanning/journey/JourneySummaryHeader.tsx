import { ReactNode } from 'react';
import { Box, Chip, ChipProps, Paper, Stack, Typography } from '@mui/material';
import { useT } from '../../../i18n/useT';
import { durationLabel } from '../planningTime';
import { JourneySummary } from './journeySummary';

export interface JourneySummaryBadge {
  key: string;
  label: string;
  color?: ChipProps['color'];
  variant?: ChipProps['variant'];
  icon?: ReactNode;
}

/**
 * The summary row every journey-shaped page shows (#247 stage 5) — a title
 * with its own colour dot and status badges, plus the three stat tiles
 * (distance, vehicle-occupied time, patients carried) computed by
 * `summarizeJourneys`. Caller-supplied badges rather than a fixed set, since
 * a single journey's own status/round-trip/crew badges don't aggregate the
 * same way across a whole vehicle-day the way the three stat tiles do.
 */
export function JourneySummaryHeader({
  colorDot,
  title,
  vehicleLabel,
  badges,
  summary,
}: {
  colorDot: string;
  title: string;
  vehicleLabel: string;
  badges: JourneySummaryBadge[];
  summary: JourneySummary;
}) {
  const t = useT();
  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
        <Box sx={{ width: 14, height: 14, borderRadius: '50%', flexShrink: 0, bgcolor: colorDot }} />
        <Typography variant="h5">{title}</Typography>
        <Chip label={vehicleLabel} />
        {badges.map((badge) => (
          <Chip key={badge.key} size="small" label={badge.label} color={badge.color} variant={badge.variant} icon={badge.icon as never} />
        ))}
      </Stack>
      <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
        <SummaryTile
          label={t('transportJourney.blockDistance')}
          value={summary.distanceKm != null ? `${Math.round(summary.distanceKm)} km` : '—'}
        />
        <SummaryTile
          label={t('transportJourney.blockOccupied')}
          value={summary.occupiedMinutes != null ? durationLabel(summary.occupiedMinutes) : '—'}
        />
        <SummaryTile label={t('transportJourney.blockPatients')} value={String(summary.patientCount)} />
      </Stack>
    </Box>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <Paper variant="outlined" sx={{ px: 2, py: 1, minWidth: 120, flex: '1 1 120px' }}>
      <Typography variant="h6" fontWeight={700}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {label}
      </Typography>
    </Paper>
  );
}
