import { useMemo, useState } from 'react';
import { useGetList } from 'react-admin';
import {
  Alert,
  Autocomplete,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from '@mui/material';
import { Trip, Vehicle } from '@redinfo/shared';
import { apiFetch, ApiError } from '../../api';
import { apiErrorLabel } from '../../i18n/labels';
import { useT } from '../../i18n/useT';

const vehicleLabel = (vehicle: Vehicle) => `${vehicle.numeroCauda} · ${vehicle.licensePlate}`;

/**
 * Creates the `Trip` a lane needs to exist before a leg can be dropped onto
 * it — the board only shows a row per vehicle that already has one (#235).
 */
export const AddVehicleLaneDialog = ({
  open,
  date,
  excludeVehicleIds,
  onClose,
  onCreated,
}: {
  open: boolean;
  date: string;
  excludeVehicleIds: string[];
  onClose: () => void;
  onCreated: (trip: Trip) => void;
}) => {
  const t = useT();
  const { data: vehicles } = useGetList<Vehicle>('vehicles', {
    pagination: { page: 1, perPage: 200 },
    sort: { field: 'numeroCauda', order: 'ASC' },
    filter: { isDeleted: false },
  });
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = useMemo(
    () => (vehicles ?? []).filter((v) => !excludeVehicleIds.includes(v.id)),
    [vehicles, excludeVehicleIds],
  );

  const handleClose = () => {
    setVehicle(null);
    setError(null);
    onClose();
  };

  const handleConfirm = async () => {
    if (!vehicle) return;
    setSaving(true);
    setError(null);
    try {
      const trip = await apiFetch<Trip>('/trips', { method: 'POST', body: { date, vehicleId: vehicle.id } });
      onCreated(trip);
      handleClose();
    } catch (cause) {
      setError(cause instanceof ApiError ? apiErrorLabel(t, cause) : t('transportPlanning.addVehicleFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('transportPlanning.addVehicleDialogTitle')}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        {error && <Alert severity="error">{error}</Alert>}
        <Autocomplete
          options={options}
          value={vehicle}
          getOptionLabel={vehicleLabel}
          isOptionEqualToValue={(option, value) => option.id === value.id}
          onChange={(_event, value) => setVehicle(value)}
          renderInput={(params) => (
            <TextField {...params} label={t('transportPlanning.addVehicleDialogVehicleLabel')} autoFocus />
          )}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>{t('transportPlanning.assignDialogCancel')}</Button>
        <Button variant="contained" disabled={!vehicle || saving} onClick={handleConfirm}>
          {t('transportPlanning.addVehicleDialogConfirm')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
