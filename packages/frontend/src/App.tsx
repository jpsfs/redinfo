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
import {
  AvailabilityWindowList,
  AvailabilityWindowCreate,
  AvailabilityWindowShow,
  HolidayList,
  HolidayCreate,
  HolidayEdit,
} from './resources/availability';
import { ScheduleList, ScheduleShow } from './resources/schedules';
import {
  EventReportList,
  EventReportCreate,
  EventReportShow,
  EventReportEdit,
} from './resources/eventReports';
import { HospitalList, HospitalCreate, HospitalEdit } from './resources/hospitals';
import { LiveEntryPage, LiveRunGate, LiveRunPage } from './resources/liveRuns';
import { MyAvailabilityPage } from './pages/MyAvailabilityPage';
import { MyDutiesPage } from './pages/MyDutiesPage';
import { MyReportsPage } from './pages/MyReportsPage';
import PeopleIcon from '@mui/icons-material/People';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import BuildIcon from '@mui/icons-material/Build';
import InventoryIcon from '@mui/icons-material/Inventory';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import DateRangeIcon from '@mui/icons-material/DateRange';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import EventNoteIcon from '@mui/icons-material/EventNote';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import DescriptionIcon from '@mui/icons-material/Description';

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

        {/* Live emergency mode owns the whole viewport: its own app bar carries
            the run clock and sync state, and the bottom bar has to be the only
            thing in thumb reach — react-admin's Layout would put a hamburger
            menu there instead. `noLayout` routes render outside the auth gate,
            so `LiveRunGate` brings the gate with it.

            The screen is a path segment rather than component state because this
            is an Android device: with it in the URL, the hardware back button
            walks screens for free and a mid-run reload lands where the crew
            was. */}
        <Route
          path="/live"
          element={
            <LiveRunGate>
              <LiveEntryPage />
            </LiveRunGate>
          }
        />
        <Route
          path="/live/:runId"
          element={
            <LiveRunGate>
              <LiveRunPage />
            </LiveRunGate>
          }
        />
        <Route
          path="/live/:runId/:screen"
          element={
            <LiveRunGate>
              <LiveRunPage />
            </LiveRunGate>
          }
        />
      </CustomRoutes>

      {/* Personal action page rather than a resource: it only ever shows the
          signed-in user's own availability, so there is nothing to list. */}
      <CustomRoutes>
        <Route path="/my-availability" element={<MyAvailabilityPage />} />
        {/* Duties span every rota someone is on, so this is not scoped to a
            single window the way My Availability is. */}
        <Route path="/my-duties" element={<MyDutiesPage />} />
        {/* Reading the whole archive needs VIEW_EVENT_REPORTS, so an
            operational reaches their own reports — and the form to file a new
            one — through here rather than the resource list. */}
        <Route path="/my-reports" element={<MyReportsPage />} />
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

      <Resource
        name="availability-windows"
        icon={DateRangeIcon}
        list={AvailabilityWindowList}
        create={AvailabilityWindowCreate}
        show={AvailabilityWindowShow}
        options={{ label: 'Availability Windows' }}
      />

      <Resource
        name="schedules"
        icon={EventNoteIcon}
        list={ScheduleList}
        show={ScheduleShow}
        options={{ label: 'Schedules' }}
      />

      <Resource
        name="event-reports"
        icon={DescriptionIcon}
        list={EventReportList}
        create={EventReportCreate}
        show={EventReportShow}
        edit={EventReportEdit}
        options={{ label: 'Reports' }}
      />

      <Resource
        name="hospitals"
        icon={LocalHospitalIcon}
        list={HospitalList}
        create={HospitalCreate}
        edit={HospitalEdit}
        options={{ label: 'Hospitals' }}
      />

      {/* Read-only reference data, reached only by the pickers that need it —
          no list, so it stays out of the menu. */}
      <Resource name="municipalities" options={{ label: 'Municipalities' }} />
      <Resource name="localities" options={{ label: 'Localities' }} />

      <Resource
        name="holidays"
        icon={EventBusyIcon}
        list={HolidayList}
        create={HolidayCreate}
        edit={HolidayEdit}
        options={{ label: 'Holidays' }}
      />
    </Admin>
  );
}
