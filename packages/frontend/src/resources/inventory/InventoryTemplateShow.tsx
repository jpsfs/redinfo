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
import { useT } from '../../i18n/useT';

const API_URL = import.meta.env.VITE_API_URL ?? '';

const AddItemButton = () => {
  const t = useT();
  const record = useRecordContext();
  if (!record) return null;
  return (
    <CreateButton
      resource="inventory-template-items"
      state={{ record: { templateId: record.id } }}
      label={t('inventoryTemplateShow.addItem')}
    />
  );
};

const ExportCsvButton = () => {
  const t = useT();
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
      {t('inventoryTemplateShow.exportCsv')}
    </Button>
  );
};

const InventoryTemplateShowActions = () => (
  <TopToolbar>
    <EditButton />
  </TopToolbar>
);

const ItemTypeChip = ({ type }: { type: string }) => {
  const t = useT();
  return (
    <Chip
      size="small"
      label={type === 'UNLIMITED' ? t('inventoryTemplateShow.unlimited') : t('inventoryTemplateShow.countable')}
      color={type === 'UNLIMITED' ? 'secondary' : 'default'}
      variant="outlined"
    />
  );
};

export const InventoryTemplateShow = () => {
  const t = useT();
  return (
    <Show actions={<InventoryTemplateShowActions />}>
      <SimpleShowLayout>
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
        <NumberField source="version" />
        <TextField source="notes" emptyText="—" />

        <Divider sx={{ my: 2 }} />

        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="h6">{t('inventoryTemplateShow.itemsHeading')}</Typography>
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
            <TextField source="name" />
            <FunctionField
              source="type"
              render={(record: { type?: string }) => <ItemTypeChip type={record.type ?? 'COUNTABLE'} />}
            />
            <FunctionField
              source="recommendedQuantity"
              render={(record: { type?: string; recommendedQuantity?: number | null }) =>
                record.type === 'UNLIMITED' ? (
                  <Chip size="small" label="∞" color="secondary" variant="outlined" />
                ) : (
                  record.recommendedQuantity ?? 0
                )
              }
            />
            <TextField source="unit" />
            <NumberField source="order" />
            <TextField source="notes" emptyText="—" />
            <DeleteButton redirect={false} />
          </Datagrid>
        </ReferenceManyField>
      </SimpleShowLayout>
    </Show>
  );
};
