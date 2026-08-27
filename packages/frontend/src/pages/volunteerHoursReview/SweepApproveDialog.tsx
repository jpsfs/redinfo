import { Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material';
import { formatMinutes } from '@redinfo/shared';
import { useT } from '../../i18n/useT';

export interface SweepApproveDialogProps {
  open: boolean;
  count: number;
  totalMinutes: number;
  saving: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Confirms the "approve all without exceptions" sweep. States plainly that
 * manual and flagged entries are excluded, so nobody assumes the queue was
 * cleared.
 */
export const SweepApproveDialog = ({
  open,
  count,
  totalMinutes,
  saving,
  error,
  onConfirm,
  onClose,
}: SweepApproveDialogProps) => {
  const t = useT();
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('volunteerHoursReview.sweepDialogTitle')}</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <DialogContentText>
          {t('volunteerHoursReview.sweepDialogBody', { count, minutes: formatMinutes(totalMinutes) })}
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          {t('volunteerHoursReview.sweepDialogCancel')}
        </Button>
        <Button onClick={onConfirm} variant="contained" disabled={saving}>
          {t('volunteerHoursReview.sweepDialogConfirm')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
