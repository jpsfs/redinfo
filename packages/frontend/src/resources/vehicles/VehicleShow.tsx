import {
  Show,
  SimpleShowLayout,
  TextField,
  DateField,
  FunctionField,
  ReferenceManyField,
  Datagrid,
  NumberField,
  TopToolbar,
  EditButton,
  CreateButton,
  useRecordContext,
} from 'react-admin';
import {
  Chip,
  Box,
  Typography,
  Divider,
} from '@mui/material';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import { VehicleInventorySection } from '../inventory';

const DAYS_WARN = 30;

function dateStatus(dateStr: string | null | undefined): 'overdue' | 'soon' | 'ok' {
  if (!dateStr) return 'ok';
  const target = new Date(dateStr);
  const now = new Date();
  if (target < now) return 'overdue';
  const diffMs = target.getTime() - now.getTime();
  if (diffMs <= DAYS_WARN * 24 * 60 * 60 * 1000) return 'soon';
  return 'ok';
}

const StatusDateField = ({
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
      const status = dateStatus(val);
      const color =
        status === 'overdue' ? 'error' : status === 'soon' ? 'warning' : 'success';
      const suffix =
        status === 'overdue' ? ' ⚠ OVERDUE' : status === 'soon' ? ' ⚠ Soon' : '';
      return (
        <Chip
          label={`${val ? new Date(val).toLocaleDateString('pt-PT') : '—'}${suffix}`}
          color={color}
          size="small"
          variant="outlined"
        />
      );
    }}
  />
);

const MaintenanceTotalField = () => {
  const record = useRecordContext<{ maintenanceEntries?: { cost: number | string }[] }>();
  if (!record?.maintenanceEntries) return null;
  const total = record.maintenanceEntries.reduce(
    (sum, e) => sum + Number(e.cost),
    0,
  );
  return (
    <Typography variant="subtitle2" sx={{ mt: 1 }}>
      Total maintenance cost:{' '}
      <strong>
        {total.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })}
      </strong>
    </Typography>
  );
};

const AddMaintenanceButton = () => {
  const record = useRecordContext();
  if (!record) return null;
  return (
    <CreateButton
      resource="maintenance"
      state={{ record: { vehicleId: record.id } }}
      label="Add Maintenance Entry"
    />
  );
};

const VehicleShowActions = () => (
  <TopToolbar>
    <EditButton />
  </TopToolbar>
);

export const VehicleShow = () => (
  <Show actions={<VehicleShowActions />}>
    <SimpleShowLayout>
      {/* ── Vehicle details ─────────────────────────── */}
      <FunctionField
        label="Vehicle Type"
        render={(record: { vehicleType?: string }) =>
          record.vehicleType === 'EMERGENCY' ? (
            <Chip
              label="Emergency"
              color="error"
              icon={<DirectionsCarIcon fontSize="small" />}
            />
          ) : (
            <Chip
              label="Transport"
              color="primary"
              icon={<LocalShippingIcon fontSize="small" />}
            />
          )
        }
      />
      <TextField source="licensePlate" label="Licence Plate" />
      <TextField source="numeroCauda" label="Nº de Cauda" />
      <TextField source="manufacturer" label="Manufacturer" emptyText="—" />
      <TextField source="model" label="Model" emptyText="—" />
      <StatusDateField source="insuranceRenewalDate" label="Insurance Renewal" />
      <StatusDateField source="nextImtInspectionDate" label="Next IMT Inspection" />
      <TextField source="notes" label="Notes" emptyText="—" />
      <DateField source="createdAt" label="Created" showTime />
      <DateField source="updatedAt" label="Last Updated" showTime />

      <Divider sx={{ my: 2 }} />

      {/* ── Inventory ────────────────────────────────────── */}
      <VehicleInventorySection />

      <Divider sx={{ my: 2 }} />

      {/* ── Maintenance registry ─────────────────────── */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="h6">Maintenance Registry</Typography>
        <AddMaintenanceButton />
      </Box>

      <MaintenanceTotalField />

      <ReferenceManyField
        reference="maintenance"
        target="vehicleId"
        label={false}
        sort={{ field: 'date', order: 'DESC' }}
      >
        <Datagrid rowClick="edit" bulkActionButtons={false}>
          <DateField source="date" label="Date" />
          <TextField source="description" label="Description" />
          <TextField source="serviceProvider" label="Service Provider" />
          <NumberField
            source="cost"
            label="Cost (€)"
            options={{ style: 'currency', currency: 'EUR' }}
          />
          <NumberField
            source="vatAmount"
            label="VAT (€)"
            options={{ style: 'currency', currency: 'EUR' }}
            emptyText="—"
          />
          <TextField source="notes" label="Notes" emptyText="—" />
        </Datagrid>
      </ReferenceManyField>
    </SimpleShowLayout>
  </Show>
);
