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
import InventoryIcon from '@mui/icons-material/Inventory';

const VehicleTypeField = () => (
  <FunctionField
    label="Vehicle Type"
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
      <NumberField source="version" label="Version" />
      <TextField source="notes" label="Notes" emptyText="—" />
      <FunctionField
        label="Items"
        render={(record: { items?: unknown[] }) =>
          record.items?.length ?? 0
        }
      />
    </Datagrid>
  </List>
);
