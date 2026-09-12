import {
  List,
  Datagrid,
  TextField,
  DateField,
  TopToolbar,
  CreateButton,
  ExportButton,
  SelectInput,
  SearchInput,
  FunctionField,
  useListContext,
} from 'react-admin';
import { useNavigate } from 'react-router-dom';
import { Box, Chip, CircularProgress, Paper, Stack, Tooltip } from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import { Vehicle } from '@redinfo/shared';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useIntlLocale } from '../../i18n/useIntlLocale';
import { useT } from '../../i18n/useT';
import { VehicleCapacityChip } from './VehicleCapacityChip';
import { VehicleCard } from './VehicleCard';
import { isExpiringSoon, isOverdue } from './vehicleDateStatus';

const ListActions = () => (
  <TopToolbar>
    <CreateButton />
    <ExportButton />
  </TopToolbar>
);

const DateAlertField = ({ source }: { source: string }) => {
  const t = useT();
  const intlLocale = useIntlLocale();
  return (
    <FunctionField
      source={source}
      render={(record: Record<string, string>) => {
        const val = record[source];
        const overdue = isOverdue(val);
        const soon = isExpiringSoon(val);
        const color = overdue ? 'error' : soon ? 'warning' : 'default';
        const icon =
          overdue || soon ? (
            <Tooltip title={overdue ? t('vehicleList.overdue') : t('vehicleList.expiringSoon')}>
              <WarningAmberIcon fontSize="small" />
            </Tooltip>
          ) : undefined;
        return (
          <Chip
            size="small"
            label={val ? new Date(val).toLocaleDateString(intlLocale) : '—'}
            color={color as 'error' | 'warning' | 'default'}
            icon={icon}
            variant="outlined"
          />
        );
      }}
    />
  );
};

const VehicleTypeField = () => {
  const t = useT();
  return (
    <FunctionField
      source="vehicleType"
      render={(record: { vehicleType?: string }) =>
        record.vehicleType === 'EMERGENCY' ? (
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
        )
      }
    />
  );
};

/** Stacked cards instead of a table — the mobile replacement for `Datagrid`. */
const MobileVehicleList = () => {
  const { data, isLoading } = useListContext<Vehicle>();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  return (
    <Stack spacing={1.5}>
      {(data ?? []).map((vehicle) => (
        <VehicleCard key={vehicle.id} vehicle={vehicle} onOpen={() => navigate(`/vehicles/${vehicle.id}/show`)} />
      ))}
    </Stack>
  );
};

export const VehicleList = () => {
  const t = useT();
  const isMobile = useIsMobile();
  const vehicleFilters = [
    <SearchInput source="q" alwaysOn key="q" />,
    <SelectInput
      source="vehicleType"
      key="vehicleType"
      choices={[
        { id: 'EMERGENCY', name: t('vehicleType.EMERGENCY') },
        { id: 'TRANSPORT', name: t('vehicleType.TRANSPORT') },
      ]}
    />,
  ];

  return (
    <List
      filters={vehicleFilters}
      actions={<ListActions />}
      sort={{ field: 'createdAt', order: 'DESC' }}
      component="div"
    >
      {/* `component="div"` drops `<List>`'s own default `Card` wrapper — only
          the table itself keeps a card, via the `Paper` below, matching the
          pattern on `/users` and `/facilities`. */}
      <Box sx={{ pt: 2 }}>
        {isMobile ? (
          <MobileVehicleList />
        ) : (
          <Paper variant="outlined">
            <Datagrid rowClick="show" bulkActionButtons={false}>
              <TextField source="licensePlate" />
              <TextField source="numeroCauda" />
              <VehicleTypeField />
              <TextField source="manufacturer" emptyText="—" />
              <TextField source="model" emptyText="—" />
              <VehicleCapacityChip />
              <DateAlertField source="insuranceRenewalDate" />
              <DateAlertField source="nextImtInspectionDate" />
              <DateField source="createdAt" showTime />
            </Datagrid>
          </Paper>
        )}
      </Box>
    </List>
  );
};
