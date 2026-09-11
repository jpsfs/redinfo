import { useEffect, useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Switch,
  TextField,
} from '@mui/material';
import { INEM_AVAILABLE_INOP_CODE, INEMUnit } from '@redinfo/shared';
import { useT } from '../../i18n/useT';
import { inemReasonLabel } from '../../i18n/labels';
import { useIsMobile } from '../../hooks/useIsMobile';

export interface SetUnitStatusDialogProps {
  /** `null` = closed. */
  unit: INEMUnit | null;
  /** The live `GET /api/INOP` map (code → INEM's own label), or its offline fallback. */
  reasons: Record<string, string>;
  saving: boolean;
  onConfirm: (unitId: string, inopCode: string) => void;
  onClose: () => void;
}

/**
 * The one place a crew member actually edits a unit's desired status (#post-#216
 * usability pass). Titled with the vehicle's own name so there is no doubt this
 * save is scoped to this one ambulance, not the whole fleet — `UnitCard` next
 * door is now purely a display, this dialog is the only writer.
 *
 * Mirrors `AdjustHoursDialog`'s shape: `unit` doubles as the open/closed flag,
 * an effect re-seeds local state whenever a *different* unit opens (keyed on
 * `unit.unitId`, not on `unit` itself) so that a failed save — which leaves
 * this dialog open for a retry — doesn't wipe the crew member's in-progress
 * edit the moment the page's own revert-reload lands.
 */
export const SetUnitStatusDialog = ({ unit, reasons, saving, onConfirm, onClose }: SetUnitStatusDialogProps) => {
  const t = useT();
  const fullScreen = useIsMobile();
  const [pending, setPending] = useState('');
  const [initialCode, setInitialCode] = useState('');

  useEffect(() => {
    if (unit) {
      const code = unit.desiredInopCode ?? '';
      setPending(code);
      setInitialCode(code);
    }
    // Re-seed only when a *different* unit opens — see the doc comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unit?.unitId]);

  if (!unit) return null;

  const checked = pending === INEM_AVAILABLE_INOP_CODE;
  const reasonValue = !checked ? pending : '';
  const dirty = pending !== initialCode;
  const canSave = dirty && pending !== '';

  // See `UnitCard`'s own comment on this in the old inline version: `reasons`
  // may not have a key for the code already selected — synthesize one rather
  // than let the select render blank for a value it can't find.
  const reasonEntries =
    reasonValue && !(reasonValue in reasons) ? { ...reasons, [reasonValue]: reasonValue } : reasons;

  const vehicleLabel = unit.vehicle ? `${unit.vehicle.licensePlate} – ${unit.vehicle.numeroCauda}` : (unit.carId ?? unit.unitId);

  return (
    <Dialog open onClose={saving ? undefined : onClose} fullWidth maxWidth="xs" fullScreen={fullScreen}>
      <DialogTitle>{t('inem.dialogTitle', { vehicle: vehicleLabel })}</DialogTitle>
      <DialogContent>
        <FormControlLabel
          sx={{ mt: 1, ml: 0 }}
          control={
            <Switch
              checked={checked}
              disabled={saving}
              onChange={(event) => setPending(event.target.checked ? INEM_AVAILABLE_INOP_CODE : '')}
            />
          }
          label={t('inem.available')}
        />

        {!checked && (
          <TextField
            select
            fullWidth
            size="small"
            label={t('inem.reasonLabel')}
            value={reasonValue}
            disabled={saving}
            onChange={(event) => setPending(event.target.value)}
            sx={{ mt: 1 }}
          >
            <MenuItem value="" disabled>
              {t('inem.reasonPlaceholder')}
            </MenuItem>
            {Object.entries(reasonEntries).map(([code, apiLabel]) => (
              <MenuItem key={code} value={code}>
                {inemReasonLabel(t, code, apiLabel)}
              </MenuItem>
            ))}
          </TextField>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          {t('action.cancel')}
        </Button>
        <Button variant="contained" disabled={!canSave || saving} onClick={() => onConfirm(unit.unitId, pending)}>
          {t('inem.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
