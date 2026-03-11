import { Admin, Resource, CustomRoutes } from 'react-admin';
import { Route } from 'react-router-dom';
import { authProvider } from './authProvider';
import { dataProvider } from './dataProvider';
import { theme } from './layout/theme';
import { AppLayout } from './layout/AppLayout';
import { LoginPage } from './pages/auth/LoginPage';
import { Dashboard } from './pages/Dashboard';
import { OAuthCallback } from './pages/auth/OAuthCallback';
import { UserList, UserEdit, UserCreate, UserShow } from './resources/users';
import {
  VehicleList,
  VehicleCreate,
  VehicleEdit,
  VehicleShow,
  MaintenanceCreate,
  MaintenanceEdit,
} from './resources/vehicles';
import {
  InventoryTemplateList,
  InventoryTemplateShow,
  InventoryTemplateCreate,
  InventoryTemplateEdit,
  InventoryItemCreate,
  InventoryItemEdit,
} from './resources/inventory';
import PeopleIcon from '@mui/icons-material/People';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import BuildIcon from '@mui/icons-material/Build';
import InventoryIcon from '@mui/icons-material/Inventory';

export default function App() {
  return (
    <Admin
      title="RedInfo"
      authProvider={authProvider}
      dataProvider={dataProvider}
      theme={theme}
      layout={AppLayout}
      loginPage={LoginPage}
      dashboard={Dashboard}
      requireAuth
    >
      <CustomRoutes noLayout>
        <Route path="/auth/callback" element={<OAuthCallback />} />
      </CustomRoutes>

      <Resource
        name="users"
        icon={PeopleIcon}
        list={UserList}
        edit={UserEdit}
        create={UserCreate}
        show={UserShow}
        options={{ label: 'Users' }}
      />

      <Resource
        name="vehicles"
        icon={DirectionsCarIcon}
        list={VehicleList}
        create={VehicleCreate}
        edit={VehicleEdit}
        show={VehicleShow}
        options={{ label: 'Vehicles' }}
      />

      <Resource
        name="maintenance"
        icon={BuildIcon}
        create={MaintenanceCreate}
        edit={MaintenanceEdit}
        options={{ label: 'Maintenance' }}
      />

      <Resource
        name="inventory-templates"
        icon={InventoryIcon}
        list={InventoryTemplateList}
        show={InventoryTemplateShow}
        create={InventoryTemplateCreate}
        edit={InventoryTemplateEdit}
        options={{ label: 'Inventory Templates' }}
      />

      <Resource
        name="inventory-template-items"
        create={InventoryItemCreate}
        edit={InventoryItemEdit}
        options={{ label: 'Inventory Items' }}
      />

      <Resource
        name="vehicle-inventory"
        options={{ label: 'Vehicle Inventory' }}
      />
    </Admin>
  );
}
