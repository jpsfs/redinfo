import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import { formatMinutes, VolunteerHoursEntry } from '@redinfo/shared';
import { useT } from '../../i18n/useT';
import { useIsMobile } from '../../hooks/useIsMobile';
import { touchTargetSize } from '../../layout/design-tokens';

export interface AdjustHoursDialogProps {
  entry: VolunteerHoursEntry | null;
  saving: boolean;
  error: string | null;
  onConfirm: (minutes: number, correctionReason?: string) => void;
  onClose: () => void;
}

const STEP_MINUTES = [-30, -15, 15, 30];

/**
 * Replaces the old raw-integer review dialog: hours + minutes with steppers
 * (coordinators think in hours), quick presets, and reason chips that
 * prefill the (still-editable) reason field. Fullscreen below `sm`.
 */
export const AdjustHoursDialog = ({ entry, saving, error, onConfirm, onClose }: AdjustHoursDialogProps) => {
  const t = useT();
  const fullScreen = useIsMobile();
  const [minutes, setMinutes] = useState(0);
  const [reason, setReason] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (entry) {
      setMinutes(entry.proposedMinutes);
      setReason('');
      setLocalError(null);
    }
  }, [entry]);

  if (!entry) return null;

  const changed = minutes !== entry.proposedMinutes;

  const handleConfirm = () => {
    if (changed && !reason.trim()) {
      setLocalError(t('volunteerHoursReview.adjustReasonRequired'));
      return;
    }
    onConfirm(minutes, changed ? reason.trim() : undefined);
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" fullScreen={fullScreen}>
      <DialogTitle>{t('volunteerHoursReview.adjustDialogTitle')}</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Stack direction="row" spacing={3} sx={{ mb: 2 }}>
          {entry.baselineMinutes !== null && entry.baselineMinutes !== undefined && (
            <Box>
              <Typography variant="caption" color="text.secondary">
                {t('volunteerHoursReview.adjustBaseline')}
              </Typography>
              <Typography variant="body2">{formatMinutes(entry.baselineMinutes)}</Typography>
            </Box>
          )}
          <Box>
            <Typography variant="caption" color="text.secondary">
              {t('volunteerHoursReview.adjustProposed')}
            </Typography>
            <Typography variant="body2">{formatMinutes(entry.proposedMinutes)}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              {t('volunteerHoursReview.adjustYourValue')}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {formatMinutes(minutes)}
            </Typography>
          </Box>
        </Stack>

        <Stack direction="row" spacing={1} alignItems="center" justifyContent="center" sx={{ mb: 2 }}>
          {STEP_MINUTES.map((step) => (
            <IconButton
              key={step}
              aria-label={`${step > 0 ? '+' : ''}${step}m`}
              onClick={() => setMinutes((prev) => Math.max(0, prev + step))}
              sx={{ minWidth: touchTargetSize, minHeight: touchTargetSize }}
            >
              {step > 0 ? <AddIcon fontSize="small" /> : <RemoveIcon fontSize="small" />}
              <Typography variant="caption" sx={{ ml: 0.25 }}>
                {Math.abs(step)}m
              </Typography>
            </IconButton>
          ))}
        </Stack>

        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
          <Chip
            size="small"
            label={t('volunteerHoursReview.adjustPresetProposed')}
            onClick={() => setMinutes(entry.proposedMinutes)}
          />
          {entry.baselineMinutes !== null && entry.baselineMinutes !== undefined && (
            <Chip
              size="small"
              label={t('volunteerHoursReview.adjustPresetScheduled')}
              onClick={() => setMinutes(entry.baselineMinutes!)}
            />
          )}
          <Chip size="small" label={t('volunteerHoursReview.adjustPresetZero')} onClick={() => setMinutes(0)} />
        </Stack>

        <TextField
          label={t('volunteerHoursReview.adjustReasonLabel')}
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
        />
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
          {[
            t('volunteerHoursReview.adjustReasonChipLeftEarly'),
            t('volunteerHoursReview.adjustReasonChipConfirmed'),
            t('volunteerHoursReview.adjustReasonChipDuplicate'),
          ].map((chipLabel) => (
            <Chip key={chipLabel} size="small" variant="outlined" label={chipLabel} onClick={() => setReason(chipLabel)} />
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          {t('volunteerHoursReview.adjustCancel')}
        </Button>
        <Button onClick={handleConfirm} variant="contained" disabled={saving}>
          {t('volunteerHoursReview.adjustSave')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
