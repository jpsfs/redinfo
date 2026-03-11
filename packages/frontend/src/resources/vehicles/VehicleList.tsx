import {
  List,
  Datagrid,
  TextField,
  DateField,
  ChipField,
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

const vehicleFilters = [
  <SearchInput source="q" alwaysOn key="q" />,
  <SelectInput
    source="vehicleType"
    key="vehicleType"
    choices={[
      { id: 'EMERGENCY', name: 'Emergency' },
      { id: 'TRANSPORT', name: 'Transport' },
    ]}
  />,
];

const ListActions = () => (
  <TopToolbar>
    <CreateButton />
    <ExportButton />
  </TopToolbar>
);

const DateAlertField = ({
  source,
  label,
}: {
  source: string;
  label: string;
}) => (
  <FunctionField
    label={label}
    render={(record: Record<string, string>) => {
      const val = record[source];
      const overdue = isOverdue(val);
      const soon = isExpiringSoon(val);
      const color = overdue ? 'error' : soon ? 'warning' : 'default';
      const icon =
        overdue || soon ? (
          <Tooltip title={overdue ? 'Overdue!' : 'Expiring soon'}>
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

const VehicleTypeField = () => (
  <FunctionField
    label="Type"
    render={(record: { vehicleType?: string }) =>
      record.vehicleType === 'EMERGENCY' ? (
        <Chip
          size="small"
          label="Emergency"
          color="error"
          icon={<DirectionsCarIcon fontSize="small" />}
        />
      ) : (
        <Chip
          size="small"
          label="Transport"
          color="primary"
          icon={<LocalShippingIcon fontSize="small" />}
        />
      )
    }
  />
);

export const VehicleList = () => (
  <List filters={vehicleFilters} actions={<ListActions />} sort={{ field: 'createdAt', order: 'DESC' }}>
    <Datagrid rowClick="show" bulkActionButtons={false}>
      <TextField source="licensePlate" label="Licence Plate" />
      <TextField source="numeroCauda" label="Nº de Cauda" />
      <VehicleTypeField />
      <TextField source="manufacturer" label="Make" emptyText="—" />
      <TextField source="model" label="Model" emptyText="—" />
      <DateAlertField source="insuranceRenewalDate" label="Insurance Renewal" />
      <DateAlertField source="nextImtInspectionDate" label="Next IMT Inspection" />
      <DateField source="createdAt" label="Created" showTime />
    </Datagrid>
  </List>
);
