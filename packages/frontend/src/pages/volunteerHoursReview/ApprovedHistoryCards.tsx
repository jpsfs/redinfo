import { Box, Button, Card, Chip, Stack, Typography } from '@mui/material';
import { formatMinutes, VolunteerHoursEntry } from '@redinfo/shared';
import { useT } from '../../i18n/useT';
import { activityTypeLabel } from '../../i18n/labels';
import { formatDate } from '../../utils/dates';
import { touchTargetSize } from '../../layout/design-tokens';

export interface ApprovedHistoryCardsProps {
  entries: VolunteerHoursEntry[];
  actingId: string | null;
  onReopen: (entry: VolunteerHoursEntry) => void;
  onDismiss: (entry: VolunteerHoursEntry) => void;
}

/** Mobile card list for the Approved tab — the desktop table's seven columns
 *  collapse onto one card per entry, same shape as `ReviewQueueCards`. */
export const ApprovedHistoryCards = ({ entries, actingId, onReopen, onDismiss }: ApprovedHistoryCardsProps) => {
  const t = useT();
  return (
    <Stack spacing={1.5}>
      {entries.map((entry) => {
        const acting = actingId === entry.id;
        return (
          <Card key={entry.id} variant="outlined" elevation={0} sx={{ p: 1.5, opacity: acting ? 0.6 : 1 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="body1" sx={{ fontWeight: 600 }}>
                {entry.user ? `${entry.user.firstName} ${entry.user.lastName}` : entry.userId}
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 600 }}>
                {formatMinutes(entry.minutes)}
              </Typography>
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
              <Chip size="small" variant="outlined" label={activityTypeLabel(t, entry.activityType)} />
              {entry.autoApproved && (
                <Chip size="small" variant="outlined" label={t('volunteerHoursReview.autoApprovedChip')} />
              )}
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              {formatDate(t, entry.date)}
            </Typography>
            <Box sx={{ mt: 0.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                {t('volunteerHoursReview.colApprovedBy')}:{' '}
                {entry.approvedBy ? `${entry.approvedBy.firstName} ${entry.approvedBy.lastName}` : '—'}
                {entry.approvedAt ? ` · ${formatDate(t, entry.approvedAt.slice(0, 10))}` : ''}
              </Typography>
              {entry.reopenedAt && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  {t('volunteerHoursReview.reopenedNotice', { date: formatDate(t, entry.reopenedAt.slice(0, 10)) })}
                </Typography>
              )}
              {entry.correctionReason && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  {entry.correctionReason}
                </Typography>
              )}
            </Box>
            <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
              <Button fullWidth variant="outlined" disabled={acting} onClick={() => onReopen(entry)} sx={{ minHeight: touchTargetSize }}>
                {t('volunteerHoursReview.reopenButton')}
              </Button>
              <Button
                fullWidth
                variant="outlined"
                color="error"
                disabled={acting}
                onClick={() => onDismiss(entry)}
                sx={{ minHeight: touchTargetSize }}
              >
                {t('volunteerHoursReview.dismissButton')}
              </Button>
            </Stack>
          </Card>
        );
      })}
    </Stack>
  );
};
