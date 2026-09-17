import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';
import { VolunteerHoursEntry } from '@redinfo/shared';
import { useT } from '../../i18n/useT';

export interface BulkApproveDialogProps {
  open: boolean;
  entries: VolunteerHoursEntry[];
  saving: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

/** Confirms a bulk approve, naming any flagged entries in the selection before it happens. */
export const BulkApproveDialog = ({ open, entries, saving, error, onConfirm, onClose }: BulkApproveDialogProps) => {
  const t = useT();
  const flagged = entries.filter((e) => e.flags.length > 0);
  const names = flagged.map((e) => (e.user ? `${e.user.firstName} ${e.user.lastName}` : e.userId)).join(', ');

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('volunteerHoursReview.bulkApproveDialogTitle')}</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {flagged.length > 0 && (
          <Alert severity="warning">{t('volunteerHoursReview.bulkApproveDialogFlaggedNote', { names })}</Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          {t('volunteerHoursReview.bulkApproveDialogCancel')}
        </Button>
        <Button onClick={onConfirm} variant="contained" disabled={saving}>
          {t('volunteerHoursReview.bulkApproveDialogConfirm')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
