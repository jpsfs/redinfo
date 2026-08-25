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
import { useT } from '../../i18n/useT';
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

const StatusDateField = ({ source }: { source: string }) => {
  const t = useT();
  return (
    <FunctionField
      source={source}
      render={(record: Record<string, string>) => {
        const val = record[source];
        const status = dateStatus(val);
        const color =
          status === 'overdue' ? 'error' : status === 'soon' ? 'warning' : 'success';
        const suffix =
          status === 'overdue'
            ? t('vehicleShow.overdueSuffix')
            : status === 'soon'
              ? t('vehicleShow.soonSuffix')
              : '';
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
};

const MaintenanceTotalField = () => {
  const t = useT();
  const record = useRecordContext<{ maintenanceEntries?: { cost: number | string }[] }>();
  if (!record?.maintenanceEntries) return null;
  const total = record.maintenanceEntries.reduce(
    (sum, e) => sum + Number(e.cost),
    0,
  );
  return (
    <Typography variant="subtitle2" sx={{ mt: 1 }}>
      {t('vehicleShow.totalMaintenanceCost')}{' '}
      <strong>
        {total.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })}
      </strong>
    </Typography>
  );
};

const AddMaintenanceButton = () => {
  const t = useT();
  const record = useRecordContext();
  if (!record) return null;
  return (
    <CreateButton
      resource="maintenance"
      state={{ record: { vehicleId: record.id } }}
      label={t('vehicleShow.addMaintenanceEntry')}
    />
  );
};

const VehicleShowActions = () => (
  <TopToolbar>
    <EditButton />
  </TopToolbar>
);

export const VehicleShow = () => {
  const t = useT();
  return (
    <Show actions={<VehicleShowActions />}>
      <SimpleShowLayout>
        {/* ── Vehicle details ─────────────────────────── */}
        <FunctionField
          source="vehicleType"
          render={(record: { vehicleType?: string }) =>
            record.vehicleType === 'EMERGENCY' ? (
              <Chip
                label={t('vehicleType.EMERGENCY')}
                color="error"
                icon={<DirectionsCarIcon fontSize="small" />}
              />
            ) : (
              <Chip
                label={t('vehicleType.TRANSPORT')}
                color="primary"
                icon={<LocalShippingIcon fontSize="small" />}
              />
            )
          }
        />
        <TextField source="licensePlate" />
        <TextField source="numeroCauda" />
        <TextField source="manufacturer" emptyText="—" />
        <TextField source="model" emptyText="—" />
        <StatusDateField source="insuranceRenewalDate" />
        <StatusDateField source="nextImtInspectionDate" />
        <TextField source="notes" emptyText="—" />
        <DateField source="createdAt" showTime />
        <DateField source="updatedAt" showTime />

        <Divider sx={{ my: 2 }} />

        {/* ── Inventory ────────────────────────────────────── */}
        <VehicleInventorySection />

        <Divider sx={{ my: 2 }} />

        {/* ── Maintenance registry ─────────────────────── */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="h6">{t('vehicleShow.maintenanceRegistryHeading')}</Typography>
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
            <DateField source="date" />
            <TextField source="description" />
            <TextField source="serviceProvider" />
            <NumberField source="cost" options={{ style: 'currency', currency: 'EUR' }} />
            <NumberField
              source="vatAmount"
              options={{ style: 'currency', currency: 'EUR' }}
              emptyText="—"
            />
            <TextField source="notes" emptyText="—" />
          </Datagrid>
        </ReferenceManyField>
      </SimpleShowLayout>
    </Show>
  );
};
