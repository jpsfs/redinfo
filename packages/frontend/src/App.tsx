import { Admin, Resource, CustomRoutes } from 'react-admin';
import { Route } from 'react-router-dom';
import { authProvider } from './authProvider';
import { dataProvider } from './dataProvider';
import { i18nProvider, store } from './i18n/i18nProvider';
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
  MaterialItemList,
  MaterialItemCreate,
  MaterialItemEdit,
} from './resources/inventory';
import {
  AvailabilityWindowList,
  AvailabilityWindowCreate,
  AvailabilityWindowShow,
  HolidayList,
  HolidayCreate,
  HolidayEdit,
} from './resources/availability';
import { ScheduleList, ScheduleShow, SchedulePrintPage } from './resources/schedules';
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
import { MyHoursPage } from './pages/MyHoursPage';
import { MyReportsPage } from './pages/MyReportsPage';
import { MyProfilePage } from './pages/MyProfilePage';
import { LiveRunsPage } from './pages/LiveRunsPage';
import { VolunteerHoursReviewPage } from './pages/VolunteerHoursReviewPage';
import { StatisticsPage } from './pages/StatisticsPage';
import PeopleIcon from '@mui/icons-material/People';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import BuildIcon from '@mui/icons-material/Build';
import InventoryIcon from '@mui/icons-material/Inventory';
import Inventory2Icon from '@mui/icons-material/Inventory2';
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
      i18nProvider={i18nProvider}
      store={store}
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

        {/* Print-optimised schedule board (AB#189/#191) — its own screen so the
            browser's print dialog sees only the rota, not react-admin's app bar
            and drawer. `noLayout` puts it outside the auth gate, so the page
            calls `useAuthenticated()` itself, same as `LiveRunGate` above.
            Ungated otherwise, matching the Export CSV button it sits beside on
            `ScheduleBoard`. */}
        <Route path="/schedules/:id/print" element={<SchedulePrintPage />} />
      </CustomRoutes>

      {/* Personal action page rather than a resource: it only ever shows the
          signed-in user's own availability, so there is nothing to list. */}
      <CustomRoutes>
        <Route path="/my-availability" element={<MyAvailabilityPage />} />
        {/* Duties span every rota someone is on, so this is not scoped to a
            single window the way My Availability is. */}
        <Route path="/my-duties" element={<MyDutiesPage />} />
        {/* Hours generated from those duties, plus anything logged by hand
            (#164). Ungated, like /my-duties above — scoped to the caller by
            the API, not by capability. */}
        <Route path="/my-hours" element={<MyHoursPage />} />
        {/* Reading the whole archive needs VIEW_EVENT_REPORTS, so an
            operational reaches their own reports — and the form to file a new
            one — through here rather than the resource list. */}
        <Route path="/my-reports" element={<MyReportsPage />} />
        {/* Everyone's own record — certifications (read-only, coordinator-
            maintained) and the contact details they keep current themselves.
            Reached from the app-bar avatar menu (`RedInfoUserMenu`), not the
            drawer — settled by #181's navigation design. */}
        <Route path="/my-profile" element={<MyProfilePage />} />
        {/* The live-runs oversight board as its own screen, gated by
            VIEW_LIVE_RUNS in the drawer manifest (layout/navigation.tsx). It
            also still appears on the Dashboard — unrelated to this route. */}
        <Route path="/live-runs" element={<LiveRunsPage />} />
        {/* The coordinator's review queue for volunteer hours (#164), gated
            by VIEW_VOLUNTEER_HOURS in the drawer manifest. */}
        <Route path="/volunteer-hours/review" element={<VolunteerHoursReviewPage />} />
        {/* Aggregate, organisation-wide dashboards (docs/plans/estatisticas-dashboards.md).
            No `requires` in the drawer manifest — every authenticated member sees it. */}
        <Route path="/statistics" element={<StatisticsPage />} />
      </CustomRoutes>

      <Resource
        name="users"
        icon={PeopleIcon}
        list={UserList}
        edit={UserEdit}
        create={UserCreate}
        show={UserShow}
      />

      <Resource
        name="vehicles"
        icon={DirectionsCarIcon}
        list={VehicleList}
        create={VehicleCreate}
        edit={VehicleEdit}
        show={VehicleShow}
      />

      <Resource
        name="maintenance"
        icon={BuildIcon}
        create={MaintenanceCreate}
        edit={MaintenanceEdit}
      />

      <Resource
        name="inventory-templates"
        icon={InventoryIcon}
        list={InventoryTemplateList}
        show={InventoryTemplateShow}
        create={InventoryTemplateCreate}
        edit={InventoryTemplateEdit}
      />

      <Resource
        name="inventory-template-items"
        create={InventoryItemCreate}
        edit={InventoryItemEdit}
      />

      <Resource name="vehicle-inventory" />

      <Resource
        name="material-items"
        icon={Inventory2Icon}
        list={MaterialItemList}
        create={MaterialItemCreate}
        edit={MaterialItemEdit}
      />

      <Resource
        name="availability-windows"
        icon={DateRangeIcon}
        list={AvailabilityWindowList}
        create={AvailabilityWindowCreate}
        show={AvailabilityWindowShow}
      />

      <Resource
        name="schedules"
        icon={EventNoteIcon}
        list={ScheduleList}
        show={ScheduleShow}
      />

      <Resource
        name="event-reports"
        icon={DescriptionIcon}
        list={EventReportList}
        create={EventReportCreate}
        show={EventReportShow}
        edit={EventReportEdit}
      />

      <Resource
        name="hospitals"
        icon={LocalHospitalIcon}
        list={HospitalList}
        create={HospitalCreate}
        edit={HospitalEdit}
      />

      {/* Read-only reference data, reached only by the pickers that need it —
          no list, so it stays out of the menu. */}
      <Resource name="municipalities" />
      <Resource name="localities" />

      <Resource
        name="holidays"
        icon={EventBusyIcon}
        list={HolidayList}
        create={HolidayCreate}
        edit={HolidayEdit}
      />
    </Admin>
  );
}
