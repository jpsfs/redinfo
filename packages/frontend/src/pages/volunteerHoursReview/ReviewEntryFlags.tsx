import { useState, MouseEvent } from 'react';
import { Box, Chip, Link, Popover, Stack, Typography } from '@mui/material';
import { VolunteerHoursEntry } from '@redinfo/shared';
import { useT } from '../../i18n/useT';

/**
 * The flag chips for one entry, with a popover rendering `flagDetails` —
 * fetched today and never rendered before this redesign. `RAN_OVER` shows
 * its `minutesOver` right on the chip; tapping/hovering either chip opens
 * the popover with the evidence behind it, including report links.
 */
export const ReviewEntryFlags = ({ entry }: { entry: VolunteerHoursEntry }) => {
  const t = useT();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  if (entry.flags.length === 0) return null;

  const open = (event: MouseEvent<HTMLElement>) => setAnchor(event.currentTarget);
  const close = () => setAnchor(null);

  return (
    <>
      <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap onClick={open} sx={{ cursor: 'pointer' }}>
        {entry.flags.includes('RAN_OVER') && (
          <Chip
            size="small"
            color="info"
            label={
              entry.flagDetails?.find((d) => d.flag === 'RAN_OVER')?.minutesOver
                ? `${t('myHours.flagRanOver')} +${entry.flagDetails.find((d) => d.flag === 'RAN_OVER')!.minutesOver}m`
                : t('myHours.flagRanOver')
            }
          />
        )}
        {entry.flags.includes('POSSIBLY_LEFT_EARLY') && (
          <Chip size="small" color="warning" label={t('myHours.flagPossiblyLeftEarly')} />
        )}
      </Stack>
      <Popover
        open={anchor !== null}
        anchorEl={anchor}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <Box sx={{ p: 2, maxWidth: 320 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            {t('volunteerHoursReview.flagsPopoverTitle')}
          </Typography>
          <Stack spacing={1}>
            {(entry.flagDetails ?? []).map((detail, index) => (
              <Box key={`${detail.flag}-${index}`}>
                <Typography variant="body2">
                  {detail.flag === 'RAN_OVER' ? t('myHours.flagRanOver') : t('myHours.flagPossiblyLeftEarly')}
                  {detail.minutesOver !== undefined ? ` (+${detail.minutesOver}m)` : ''}
                </Typography>
                {detail.reportIds?.map((reportId) => (
                  <Link key={reportId} href={`/#/event-reports/${reportId}`} variant="caption" sx={{ mr: 1 }}>
                    {t('volunteerHoursReview.flagsPopoverReportLink')}
                  </Link>
                ))}
              </Box>
            ))}
          </Stack>
        </Box>
      </Popover>
    </>
  );
};
