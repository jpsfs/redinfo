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
import PeopleIcon from '@mui/icons-material/People';

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
    </Admin>
  );
}
