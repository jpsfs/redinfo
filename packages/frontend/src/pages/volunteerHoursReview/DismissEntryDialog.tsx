import { useEffect, useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from '@mui/material';
import { MAX_DISMISSAL_REASON_LENGTH, VolunteerHoursEntry } from '@redinfo/shared';
import { useT } from '../../i18n/useT';

export interface DismissEntryDialogProps {
  entry: VolunteerHoursEntry | null;
  saving: boolean;
  error: string | null;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}

/** A coordinator dismissing (soft-deleting) an entry that should not exist at all — reason required. */
export const DismissEntryDialog = ({ entry, saving, error, onConfirm, onClose }: DismissEntryDialogProps) => {
  const t = useT();
  const [reason, setReason] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (entry) {
      setReason('');
      setLocalError(null);
    }
  }, [entry]);

  if (!entry) return null;

  const handleConfirm = () => {
    if (!reason.trim()) {
      setLocalError(t('volunteerHoursReview.dismissReasonRequired'));
      return;
    }
    onConfirm(reason.trim());
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('volunteerHoursReview.dismissDialogTitle')}</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <TextField
          label={t('volunteerHoursReview.dismissReasonLabel')}
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setLocalError(null);
          }}
          multiline
          minRows={2}
          fullWidth
          error={localError !== null}
          helperText={localError}
          inputProps={{ maxLength: MAX_DISMISSAL_REASON_LENGTH }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          {t('volunteerHoursReview.dismissCancel')}
        </Button>
        <Button onClick={handleConfirm} variant="contained" color="error" disabled={saving}>
          {t('volunteerHoursReview.dismissConfirm')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
