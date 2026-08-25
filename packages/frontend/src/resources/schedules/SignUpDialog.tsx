import { useState } from 'react';
import {
  Alert,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import HowToRegIcon from '@mui/icons-material/HowToReg';
import { formatRoleCapacity, ScheduleAssignment } from '@redinfo/shared';
import { apiFetch, ApiError } from '../../api';
import { apiErrorLabel } from '../../i18n/labels';
import { useT } from '../../i18n/useT';
import { formatDayLabel } from '../../utils/dates';
import { AssignTarget } from './AssignPersonDialog';

/**
 * Taking an open place on a published rota.
 *
 * Confirmed rather than one-click because it is a one-way door: a member may
 * fill a place but not vacate it, so the dialog says so before they commit
 * instead of leaving them to discover it.
 */
export const SignUpDialog = ({
  scheduleId,
  target,
  vehiclesNeeded,
  onClose,
  onSignedUp,
}: {
  scheduleId: string;
  target: AssignTarget | null;
  vehiclesNeeded: number;
  onClose: () => void;
  onSignedUp: () => void;
}) => {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signUp = async () => {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch<ScheduleAssignment>(`/schedules/${scheduleId}/assignments/me`, {
        method: 'POST',
        body: {
          date: target.date,
          slot: target.slot,
          ...(target.role ? { roleId: target.role.id } : {}),
        },
      });
      onSignedUp();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? apiErrorLabel(t, e)
          : e instanceof Error
            ? e.message
            : t('signUpDialog.failed'),
      );
    } finally {
      setBusy(false);
    }
  };

  if (!target) return null;

  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1 }}>
        <HowToRegIcon color="primary" />
        {t('signUpDialog.title')}
      </DialogTitle>

      <DialogContent>
        {error && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Typography variant="body1" sx={{ fontWeight: 600 }}>
          {formatDayLabel(target.date)} · {target.shiftLabel}
        </Typography>

        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
          <Chip size="small" variant="outlined" label={target.role?.name ?? t('scheduleBoard.crewColumn')} />
          {target.role && (
            <Chip
              size="small"
              variant="outlined"
              label={formatRoleCapacity(target.role.maxPeople)}
            />
          )}
          {vehiclesNeeded > 0 && (
            <Chip
              size="small"
              variant="outlined"
              icon={<DirectionsCarIcon fontSize="small" />}
              label={t(
                vehiclesNeeded === 1 ? 'signUpDialog.vehicleCountOne' : 'signUpDialog.vehicleCountMany',
                { count: vehiclesNeeded },
              )}
            />
          )}
        </Stack>

        <Alert severity="info" sx={{ mt: 2 }}>
          {t('signUpDialog.cannotUndo')}
        </Alert>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {t('action.cancel')}
        </Button>
        <Button
          variant="contained"
          onClick={() => void signUp()}
          disabled={busy}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <HowToRegIcon />}
        >
          {t('scheduleBoard.addMe')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
