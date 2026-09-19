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
  Typography,
} from '@mui/material';
import { TransportPlanningLane } from '@redinfo/shared';
import { apiFetch, ApiError } from '../../api';
import { apiErrorLabel } from '../../i18n/labels';
import { useT } from '../../i18n/useT';
import { UnplannedGroup } from './unplannedGroups';
import { fromDatetimeLocalValue, toDatetimeLocalValue } from './planningTime';

/** A drop has to produce *some* dropoff time — see `TransportPlanningPage`'s
 * own `legDurationMinutes` doc comment for why this is a guess and not a
 * measurement. */
const DEFAULT_GROUP_DURATION_MINUTES = 30;

/**
 * Assigns every leg in an unplanned group to the same journey in one action
 * — the "one dialog" interaction the design doc lists alongside drag and
 * suggestion for assigning a group whole
 * (`docs/plans/planeamento-transportes-redesign.md` §3, §8). Every leg gets
 * the same pickup/dropoff pair, since the whole point of the group is that
 * they board together; a planner who wants to split it uses "por pessoa"
 * and `AssignLegDialog` instead.
 *
 * Calls the same `POST /trips/:id/legs` `AssignLegDialog` does, once per
 * person, sequentially — no new endpoint. A capacity conflict on any one of
 * them stops the batch rather than leaving the group half-assigned.
 */
export const AssignGroupDialog = ({
  group,
  lanes,
  onClose,
  onSaved,
}: {
  group: UnplannedGroup | null;
  lanes: TransportPlanningLane[];
  onClose: () => void;
  onSaved: () => void;
}) => {
  const t = useT();
  const [laneId, setLaneId] = useState('');
  const [pickup, setPickup] = useState('');
  const [dropoff, setDropoff] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [assignedCount, setAssignedCount] = useState(0);

  useEffect(() => {
    if (!group) return;
    setLaneId('');
    const pickupIso = group.arrivalInstant;
    setPickup(toDatetimeLocalValue(pickupIso));
    setDropoff(toDatetimeLocalValue(new Date(new Date(pickupIso).getTime() + DEFAULT_GROUP_DURATION_MINUTES * 60_000).toISOString()));
    setError(null);
    setAssignedCount(0);
  }, [group]);

  if (!group) return null;

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
    setAssignedCount(0);
    for (const legId of group.legIds) {
      try {
        await apiFetch(`/trips/${laneId}/legs`, {
          method: 'POST',
          body: { transportLegId: legId, pickupPlannedAt: pickupIso, dropoffPlannedAt: dropoffIso },
        });
        setAssignedCount((count) => count + 1);
      } catch (cause) {
        setError(cause instanceof ApiError ? apiErrorLabel(t, cause) : t('transportPlanning.assignFailed'));
        setSaving(false);
        return;
      }
    }
    setSaving(false);
    onSaved();
    handleClose();
  };

  return (
    <Dialog open onClose={handleClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('transportPlanning.assignGroupDialogTitle', { count: group.legIds.length })}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {t('transportPlanning.assignGroupDialogHint')}
          </Typography>
          {error && (
            <Alert severity="error">
              {assignedCount > 0 ? t('transportPlanning.assignGroupPartial', { count: assignedCount }) + ' ' : ''}
              {error}
            </Alert>
          )}
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
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3 }}>
        <Button onClick={handleClose}>{t('transportPlanning.assignDialogCancel')}</Button>
        <Button variant="contained" disabled={saving} onClick={handleConfirm}>
          {t('transportPlanning.assignDialogConfirm')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
