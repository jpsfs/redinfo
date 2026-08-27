import { Box, Button, Paper, Typography } from '@mui/material';
import { formatMinutes } from '@redinfo/shared';
import { useT } from '../../i18n/useT';
import { touchTargetSize } from '../../layout/design-tokens';

export interface BulkActionBarProps {
  count: number;
  totalMinutes: number;
  onApprove: () => void;
  onClear: () => void;
}

/**
 * Appears once the selection is non-empty. Sticky under the toolbar on
 * desktop; fixed to the bottom of the viewport on mobile, where the thumb is.
 */
export const BulkActionBar = ({ count, totalMinutes, onApprove, onClear }: BulkActionBarProps) => {
  const t = useT();
  if (count === 0) return null;

  return (
    <Paper
      elevation={4}
      sx={{
        position: { xs: 'fixed', sm: 'sticky' },
        bottom: { xs: 0, sm: 'auto' },
        left: { xs: 0, sm: 'auto' },
        right: { xs: 0, sm: 'auto' },
        top: { sm: 0 },
        zIndex: 10,
        p: 1.5,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 2,
      }}
    >
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {t('volunteerHoursReview.bulkSelectedLabel', { count, minutes: formatMinutes(totalMinutes) })}
      </Typography>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button onClick={onClear} sx={{ minHeight: touchTargetSize }}>
          {t('volunteerHoursReview.bulkClearButton')}
        </Button>
        <Button variant="contained" onClick={onApprove} sx={{ minHeight: touchTargetSize }}>
          {t('volunteerHoursReview.bulkApproveButton')}
        </Button>
      </Box>
    </Paper>
  );
};
