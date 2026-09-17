import { Stack, Typography } from '@mui/material';
import { formatMinutes, VolunteerHoursReviewCounts } from '@redinfo/shared';
import { useT } from '../../i18n/useT';
import { toIsoDate } from '../../utils/dates';

function daysAgo(date: string): number {
  const today = toIsoDate(new Date());
  const ms = Date.parse(`${today}T00:00:00.000Z`) - Date.parse(`${date}T00:00:00.000Z`);
  return Math.max(0, Math.round(ms / 86_400_000));
}

/** The four-stat strip above the filter chips: waiting, pending hours, exceptions, oldest. */
export const ReviewStatsHeader = ({ counts }: { counts: VolunteerHoursReviewCounts }) => {
  const t = useT();
  const exceptions = counts.ranOver + counts.possiblyLeftEarly;

  return (
    <Stack
      direction="row"
      spacing={2}
      flexWrap="wrap"
      useFlexGap
      divider={<Typography color="text.disabled">·</Typography>}
      sx={{ py: 1 }}
    >
      <Typography variant="body2" color="text.secondary">
        {t('volunteerHoursReview.statsWaiting', { count: counts.all })}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {t('volunteerHoursReview.statsPendingMinutes', { minutes: formatMinutes(counts.totalProposedMinutes) })}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {t('volunteerHoursReview.statsExceptions', { count: exceptions })}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {counts.oldestDate && daysAgo(counts.oldestDate) > 0
          ? t('volunteerHoursReview.statsOldest', { days: daysAgo(counts.oldestDate) })
          : t('volunteerHoursReview.statsOldestToday')}
      </Typography>
    </Stack>
  );
};
