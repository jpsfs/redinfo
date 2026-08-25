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
} from 'react-admin';
import { Chip, Tooltip } from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import { useT } from '../../i18n/useT';

const DAYS_WARN = 30;

function isExpiringSoon(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  const target = new Date(dateStr);
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();
  return diffMs >= 0 && diffMs <= DAYS_WARN * 24 * 60 * 60 * 1000;
}

function isOverdue(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}

const ListActions = () => (
  <TopToolbar>
    <CreateButton />
    <ExportButton />
  </TopToolbar>
);

const DateAlertField = ({ source }: { source: string }) => {
  const t = useT();
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
            label={val ? new Date(val).toLocaleDateString('pt-PT') : '—'}
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

export const VehicleList = () => {
  const t = useT();
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
    <List filters={vehicleFilters} actions={<ListActions />} sort={{ field: 'createdAt', order: 'DESC' }}>
      <Datagrid rowClick="show" bulkActionButtons={false}>
        <TextField source="licensePlate" />
        <TextField source="numeroCauda" />
        <VehicleTypeField />
        <TextField source="manufacturer" emptyText="—" />
        <TextField source="model" emptyText="—" />
        <DateAlertField source="insuranceRenewalDate" />
        <DateAlertField source="nextImtInspectionDate" />
        <DateField source="createdAt" showTime />
      </Datagrid>
    </List>
  );
};
