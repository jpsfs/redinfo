import { RecordContextProvider } from 'react-admin';
import { Chip, Paper, Stack, Tooltip, Typography } from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import { Vehicle } from '@redinfo/shared';
import { useIntlLocale } from '../../i18n/useIntlLocale';
import { useT } from '../../i18n/useT';
import { isExpiringSoon, isOverdue } from './vehicleDateStatus';
import { VehicleCapacityChip } from './VehicleCapacityChip';

/** One renewal/inspection date, as a chip — same overdue/expiring-soon
 * colouring as `DateAlertField` on the desktop `Datagrid`. */
const DateChip = ({ dateStr, label }: { dateStr: string | null | undefined; label: string }) => {
  const t = useT();
  const intlLocale = useIntlLocale();
  const overdue = isOverdue(dateStr);
  const soon = isExpiringSoon(dateStr);
  const color = overdue ? 'error' : soon ? 'warning' : 'default';
  return (
    <Tooltip title={label}>
      <Chip
        size="small"
        variant="outlined"
        color={color}
        label={dateStr ? new Date(dateStr).toLocaleDateString(intlLocale) : '—'}
        icon={
          overdue || soon ? (
            <WarningAmberIcon fontSize="small" titleAccess={overdue ? t('vehicleList.overdue') : t('vehicleList.expiringSoon')} />
          ) : undefined
        }
      />
    </Tooltip>
  );
};

/** One vehicle, as a stacked card — the mobile replacement for a row of the
 * desktop `Datagrid` on `/vehicles`, in the same shape as `PersonCard`. */
export const VehicleCard = ({ vehicle, onOpen }: { vehicle: Vehicle; onOpen: () => void }) => {
  const t = useT();
  return (
    <Paper variant="outlined" onClick={onOpen} sx={{ p: 2, cursor: 'pointer' }}>
      <Stack spacing={0.75}>
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
          <Typography sx={{ fontWeight: 700 }}>{vehicle.licensePlate}</Typography>
          {vehicle.vehicleType === 'EMERGENCY' ? (
            <Chip
              size="small"
              label={t('vehicleType.EMERGENCY')}
              color="error"
              icon={<DirectionsCarIcon fontSize="small" />}
            />
          ) : (
            <Chip
              size="small"
              label={t('vehicleType.TRANSPORT')}
              color="primary"
              icon={<LocalShippingIcon fontSize="small" />}
            />
          )}
        </Stack>

        <Typography variant="body2" color="text.secondary">
          {vehicle.numeroCauda}
          {(vehicle.manufacturer || vehicle.model) &&
            ` · ${[vehicle.manufacturer, vehicle.model].filter(Boolean).join(' ')}`}
        </Typography>

        {/* `VehicleCapacityChip` reads its record via `useRecordContext`, so it
            needs a provider here — `VehicleCard` isn't itself inside one, unlike
            a `Datagrid` row on the desktop table. */}
        <RecordContextProvider value={vehicle}>
          <VehicleCapacityChip />
        </RecordContextProvider>

        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
          <DateChip
            dateStr={vehicle.insuranceRenewalDate}
            label={t('resources.vehicles.fields.insuranceRenewalDate')}
          />
          <DateChip
            dateStr={vehicle.nextImtInspectionDate}
            label={t('resources.vehicles.fields.nextImtInspectionDate')}
          />
        </Stack>
      </Stack>
    </Paper>
  );
};
