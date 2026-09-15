import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
} from '@mui/material';
import { TransportPlanningLane } from '@redinfo/shared';
import { apiFetch, ApiError } from '../../api';
import { apiErrorLabel } from '../../i18n/labels';
import { useT } from '../../i18n/useT';
import { fromDatetimeLocalValue, toDatetimeLocalValue } from './planningTime';

export interface AssignLegDialogTarget {
  legId: string;
  /** Empty for a fresh assignment out of the unassigned-legs rail. */
  tripId: string;
  pickupPlannedAt: string;
  dropoffPlannedAt: string;
  /** Set when a drag already tried this exact move and hit a vehicle
   * conflict — pre-opens the override-reason field with the reason why. */
  conflictMessage?: string;
}

/**
 * Assign, reassign or unassign a leg's `PICKUP`/`DROPOFF` pair — the
 * keyboard/dialog equivalent to dragging (#235's own accessibility
 * requirement), and also where an override reason is typed after a vehicle
 * conflict, whichever path (drag or this dialog) hit it first.
 */
export const AssignLegDialog = ({
  target,
  lanes,
  onClose,
  onSaved,
}: {
  target: AssignLegDialogTarget | null;
  lanes: TransportPlanningLane[];
  onClose: () => void;
  onSaved: () => void;
}) => {
  const t = useT();
  const [laneId, setLaneId] = useState('');
  const [pickup, setPickup] = useState('');
  const [dropoff, setDropoff] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [conflict, setConflict] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!target) return;
    setLaneId(target.tripId);
    setPickup(toDatetimeLocalValue(target.pickupPlannedAt));
    setDropoff(toDatetimeLocalValue(target.dropoffPlannedAt));
    setOverrideReason('');
    setConflict(target.conflictMessage ?? null);
    setError(null);
  }, [target]);

  if (!target) return null;
  const isEdit = target.tripId !== '';

  const handleClose = () => {
    setSaving(false);
    onClose();
  };

  const handleConfirm = async () => {
    if (!laneId) {
      setError(t('transportPlanning.assignDialogChooseLane'));
      return;
    }
    const pickupIso = fromDatetimeLocalValue(pickup);
    const dropoffIso = fromDatetimeLocalValue(dropoff);
    if (new Date(dropoffIso) < new Date(pickupIso)) {
      setError(t('transportPlanning.assignDialogInvalidRange'));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/trips/${laneId}/legs`, {
        method: 'POST',
        body: {
          transportLegId: target.legId,
          pickupPlannedAt: pickupIso,
          dropoffPlannedAt: dropoffIso,
          ...(overrideReason ? { vehicleOverrideReason: overrideReason } : {}),
        },
      });
      onSaved();
      handleClose();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        setConflict(cause.message);
      } else {
        setError(cause instanceof ApiError ? apiErrorLabel(t, cause) : t('transportPlanning.assignFailed'));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleUnassign = async () => {
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/trips/${target.tripId}/legs/${target.legId}`, { method: 'DELETE' });
      onSaved();
      handleClose();
    } catch (cause) {
      setError(cause instanceof ApiError ? apiErrorLabel(t, cause) : t('transportPlanning.unassignFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={handleClose} fullWidth maxWidth="xs">
      <DialogTitle>
        {t(isEdit ? 'transportPlanning.assignDialogTitleEdit' : 'transportPlanning.assignDialogTitleNew')}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            select
            label={t('transportPlanning.assignDialogLaneLabel')}
            value={laneId}
            onChange={(e) => setLaneId(e.target.value)}
            autoFocus
          >
            {lanes.map((lane) => (
              <MenuItem key={lane.trip.id} value={lane.trip.id}>
                {lane.vehicle.numeroCauda} · {lane.vehicle.licensePlate}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            type="datetime-local"
            label={t('transportPlanning.assignDialogPickupLabel')}
            value={pickup}
            onChange={(e) => setPickup(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            type="datetime-local"
            label={t('transportPlanning.assignDialogDropoffLabel')}
            value={dropoff}
            onChange={(e) => setDropoff(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          {conflict && (
            <>
              <Alert severity="warning">{t('transportPlanning.assignDialogOverrideHint')} {conflict}</Alert>
              <TextField
                label={t('transportPlanning.assignDialogOverrideReasonLabel')}
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                multiline
                minRows={2}
              />
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between', px: 3 }}>
        {isEdit ? (
          <Button color="error" disabled={saving} onClick={handleUnassign}>
            {t('transportPlanning.assignDialogUnassign')}
          </Button>
        ) : (
          <span />
        )}
        <Stack direction="row" spacing={1}>
          <Button onClick={handleClose}>{t('transportPlanning.assignDialogCancel')}</Button>
          <Button
            variant="contained"
            disabled={saving || (!!conflict && !overrideReason)}
            onClick={handleConfirm}
          >
            {t('transportPlanning.assignDialogConfirm')}
          </Button>
        </Stack>
      </DialogActions>
    </Dialog>
  );
};
