import {
  Show,
  SimpleShowLayout,
  TextField,
  NumberField,
  FunctionField,
  ReferenceManyField,
  Datagrid,
  TopToolbar,
  EditButton,
  CreateButton,
  useRecordContext,
  DeleteButton,
} from 'react-admin';
import {
  Chip,
  Box,
  Typography,
  Divider,
  Button,
} from '@mui/material';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import DownloadIcon from '@mui/icons-material/Download';

const API_URL = import.meta.env.VITE_API_URL ?? '';

const AddItemButton = () => {
  const record = useRecordContext();
  if (!record) return null;
  return (
    <CreateButton
      resource="inventory-template-items"
      state={{ record: { templateId: record.id } }}
      label="Add Item"
    />
  );
};

const ExportCsvButton = () => {
  const record = useRecordContext();
  if (!record) return null;
  return (
    <Button
      size="small"
      variant="outlined"
      startIcon={<DownloadIcon />}
      href={`${API_URL}/inventory-templates/${record.id}/csv`}
      target="_blank"
      rel="noopener noreferrer"
    >
      Export CSV
    </Button>
  );
};

const InventoryTemplateShowActions = () => (
  <TopToolbar>
    <EditButton />
  </TopToolbar>
);

const ItemTypeChip = ({ type }: { type: string }) => (
  <Chip
    size="small"
    label={type === 'UNLIMITED' ? 'Unlimited' : 'Countable'}
    color={type === 'UNLIMITED' ? 'secondary' : 'default'}
    variant="outlined"
  />
);

export const InventoryTemplateShow = () => (
  <Show actions={<InventoryTemplateShowActions />}>
    <SimpleShowLayout>
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
      <NumberField source="version" label="Template Version" />
      <TextField source="notes" label="Notes" emptyText="—" />

      <Divider sx={{ my: 2 }} />

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="h6">Inventory Items</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <ExportCsvButton />
          <AddItemButton />
        </Box>
      </Box>

      <ReferenceManyField
        reference="inventory-template-items"
        target="templateId"
        label={false}
        sort={{ field: 'order', order: 'ASC' }}
      >
        <Datagrid rowClick="edit" bulkActionButtons={false}>
          <TextField source="name" label="Item Name" />
          <FunctionField
            label="Type"
            render={(record: { type?: string }) => (
              <ItemTypeChip type={record.type ?? 'COUNTABLE'} />
            )}
          />
          <FunctionField
            label="Recommended Qty"
            render={(record: { type?: string; recommendedQuantity?: number | null }) =>
              record.type === 'UNLIMITED' ? (
                <Chip size="small" label="∞ Unlimited" color="secondary" variant="outlined" />
              ) : (
                record.recommendedQuantity ?? 0
              )
            }
          />
          <TextField source="unit" label="Unit" />
          <NumberField source="order" label="Order" />
          <TextField source="notes" label="Notes" emptyText="—" />
          <DeleteButton redirect={false} />
        </Datagrid>
      </ReferenceManyField>
    </SimpleShowLayout>
  </Show>
);
