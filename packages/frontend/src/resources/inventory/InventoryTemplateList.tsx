import {
  List,
  Datagrid,
  TextField,
  NumberField,
  FunctionField,
  TopToolbar,
  CreateButton,
} from 'react-admin';
import { Chip } from '@mui/material';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import { useT } from '../../i18n/useT';

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

const ListActions = () => (
  <TopToolbar>
    <CreateButton />
  </TopToolbar>
);

export const InventoryTemplateList = () => (
  <List
    actions={<ListActions />}
    sort={{ field: 'vehicleType', order: 'ASC' }}
    pagination={false}
  >
    <Datagrid rowClick="show" bulkActionButtons={false}>
      <VehicleTypeField />
      <NumberField source="version" />
      <TextField source="notes" emptyText="—" />
      <FunctionField
        source="items"
        render={(record: { items?: unknown[] }) => record.items?.length ?? 0}
      />
    </Datagrid>
  </List>
);
