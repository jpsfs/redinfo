import { Box, Button, Card, Checkbox, Chip, Stack, Typography } from '@mui/material';
import { formatMinutes, VolunteerHoursEntry } from '@redinfo/shared';
import { useT } from '../../i18n/useT';
import { activityTypeLabel } from '../../i18n/labels';
import { formatDayLabel } from '../../utils/dates';
import { CategoryChip } from '../../components/CategoryChip';
import { touchTargetSize } from '../../layout/design-tokens';
import { ReviewEntryFlags } from './ReviewEntryFlags';

const ROTA_CATEGORIES = new Set(['EMERGENCY', 'LOCAL_SUPPORT', 'CNE_SUPPORT']);

function daysAgo(date: string): number {
  const today = new Date().toISOString().slice(0, 10);
  const ms = Date.parse(`${today}T00:00:00.000Z`) - Date.parse(`${date}T00:00:00.000Z`);
  return Math.max(0, Math.round(ms / 86_400_000));
}

export interface ReviewQueueCardsProps {
  entries: VolunteerHoursEntry[];
  selected: Set<string>;
  savingIds: Set<string>;
  onToggle: (id: string) => void;
  onApprove: (entry: VolunteerHoursEntry) => void;
  onAdjust: (entry: VolunteerHoursEntry) => void;
}

/**
 * Mobile card list — tapping the card body (not the action buttons) toggles
 * selection, so multi-select is a thumb-flick down the list. No swipe
 * gestures: undiscoverable, and a mis-swipe is only recoverable via the
 * Approved tab.
 */
export const ReviewQueueCards = ({ entries, selected, savingIds, onToggle, onApprove, onAdjust }: ReviewQueueCardsProps) => {
  const t = useT();
  return (
    <Stack spacing={1.5}>
      {entries.map((entry) => {
        const saving = savingIds.has(entry.id);
        const age = daysAgo(entry.date);
        return (
          <Card
            key={entry.id}
            variant="outlined"
            elevation={0}
            onClick={() => !saving && onToggle(entry.id)}
            sx={{ p: 1.5, opacity: saving ? 0.6 : 1, cursor: 'pointer' }}
          >
            <Stack direction="row" alignItems="flex-start" spacing={1}>
              <Checkbox
                checked={selected.has(entry.id)}
                onClick={(e) => e.stopPropagation()}
                onChange={() => onToggle(entry.id)}
                disabled={saving}
                sx={{ p: 0.5 }}
              />
              <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="body1" sx={{ fontWeight: 600 }}>
                    {entry.user ? `${entry.user.firstName} ${entry.user.lastName}` : entry.userId}
                  </Typography>
                  <Typography variant="body1" sx={{ fontWeight: 600 }}>
                    {formatMinutes(entry.proposedMinutes)}
                  </Typography>
                </Stack>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
                  {ROTA_CATEGORIES.has(entry.activityType) ? (
                    <CategoryChip size="small" category={entry.activityType} label={activityTypeLabel(t, entry.activityType)} />
                  ) : (
                    <Chip size="small" variant="outlined" label={activityTypeLabel(t, entry.activityType)} />
                  )}
                  {entry.source === 'MANUAL' && (
                    <Chip size="small" variant="outlined" label={t('myHours.manualBadge')} />
                  )}
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                  {formatDayLabel(t, entry.date)}
                  {age > 7 ? ` · ${t('volunteerHoursReview.ago', { days: age })}` : ''}
                </Typography>
                <Box sx={{ mt: 0.5 }}>
                  <ReviewEntryFlags entry={entry} />
                </Box>
                {entry.description && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                    {entry.description}
                  </Typography>
                )}
                <Stack direction="row" spacing={1} sx={{ mt: 1.5 }} onClick={(e) => e.stopPropagation()}>
                  <Button
                    fullWidth
                    variant="outlined"
                    disabled={saving}
                    onClick={() => onAdjust(entry)}
                    sx={{ minHeight: touchTargetSize }}
                  >
                    {t('volunteerHoursReview.adjustButton')}
                  </Button>
                  <Button
                    fullWidth
                    variant="contained"
                    disabled={saving}
                    onClick={() => onApprove(entry)}
                    sx={{ minHeight: touchTargetSize }}
                  >
                    {t('volunteerHoursReview.approveButton')}
                  </Button>
                </Stack>
              </Box>
            </Stack>
          </Card>
        );
      })}
    </Stack>
  );
};
