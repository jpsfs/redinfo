import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { DwellBreakEven, TripStopDwell } from '@redinfo/shared';
import { apiFetch, ApiError } from '../../api';
import { apiErrorLabel } from '../../i18n/labels';
import { useT } from '../../i18n/useT';

export interface WaitReleaseTarget {
  tripId: string;
  /** The `DROPOFF` stop the decision hangs off — see `TripBreakEvenService`. */
  dropoffStopId: string;
  facilityId: string | null;
  /** The dropoff's own planned time — the WAIT stop this dialog creates
   * starts there. */
  plannedAt: string;
}

/**
 * "Wait when the round trip back to base exceeds the expected dwell" (#219)
 * — data only. The comparison is shown; the choice, and the dwell minutes,
 * are always the planner's (Acceptance criteria for #235: "the board never
 * chooses for the planner").
 */
export const WaitReleaseDialog = ({
  target,
  onClose,
  onSaved,
}: {
  target: WaitReleaseTarget | null;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const t = useT();
  const [breakEven, setBreakEven] = useState<DwellBreakEven | null>(null);
  const [decision, setDecision] = useState<TripStopDwell>(TripStopDwell.WAIT);
  const [dwellMinutes, setDwellMinutes] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!target) return;
    setBreakEven(null);
    setError(null);
    setDecision(TripStopDwell.WAIT);
    apiFetch<DwellBreakEven>(`/trips/${target.tripId}/stops/${target.dropoffStopId}/break-even`)
      .then((result) => {
        setBreakEven(result);
        setDwellMinutes(Math.max(0, result.expectedDwellMinutes));
      })
      .catch((cause) => setError(cause instanceof ApiError ? apiErrorLabel(t, cause) : t('transportPlanning.breakEvenFailed')));
  }, [target, t]);

  if (!target) return null;

  const handleClose = () => {
    setSaving(false);
    onClose();
  };

  const handleConfirm = async () => {
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/trips/${target.tripId}/stops`, {
        method: 'POST',
        body: {
          kind: 'WAIT',
          plannedAt: target.plannedAt,
          facilityId: target.facilityId,
          dwellDecision: decision,
          dwellMinutes: decision === TripStopDwell.WAIT ? dwellMinutes : 0,
        },
      });
      onSaved();
      handleClose();
    } catch (cause) {
      setError(cause instanceof ApiError ? apiErrorLabel(t, cause) : t('transportPlanning.waitReleaseFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={handleClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('transportPlanning.waitReleaseDialogTitle')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {breakEven && (
            <>
              <Typography variant="body2" color="text.secondary">
                {t('transportPlanning.waitReleaseHint')}
              </Typography>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2">{t('transportPlanning.waitReleaseExpectedDwell')}</Typography>
                <Typography variant="body2" fontWeight={600}>
                  {t('transportPlanning.minutes', { count: breakEven.expectedDwellMinutes })}
                </Typography>
              </Stack>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2">{t('transportPlanning.waitReleaseRoundTrip')}</Typography>
                <Typography variant="body2" fontWeight={600}>
                  {t('transportPlanning.minutes', { count: breakEven.roundTripToBaseMinutes })}
                </Typography>
              </Stack>
              <ToggleButtonGroup
                exclusive
                fullWidth
                value={decision}
                onChange={(_event, value: TripStopDwell | null) => value && setDecision(value)}
              >
                <ToggleButton value={TripStopDwell.WAIT}>{t('transportPlanning.waitOption')}</ToggleButton>
                <ToggleButton value={TripStopDwell.RELEASE}>{t('transportPlanning.releaseOption')}</ToggleButton>
              </ToggleButtonGroup>
              {decision === TripStopDwell.WAIT && (
                <TextField
                  type="number"
                  label={t('transportPlanning.waitReleaseDwellMinutesLabel')}
                  value={dwellMinutes}
                  onChange={(e) => setDwellMinutes(Math.max(0, Number(e.target.value)))}
                  inputProps={{ min: 0 }}
                />
              )}
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>{t('transportPlanning.assignDialogCancel')}</Button>
        <Button variant="contained" disabled={!breakEven || saving} onClick={handleConfirm}>
          {t('transportPlanning.waitReleaseConfirm')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
