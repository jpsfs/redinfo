import { ReactElement } from 'react';
import BoltIcon from '@mui/icons-material/Bolt';
import HomeIcon from '@mui/icons-material/Home';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import AssignmentIndIcon from '@mui/icons-material/AssignmentInd';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import ArticleIcon from '@mui/icons-material/Article';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import DescriptionIcon from '@mui/icons-material/Description';
import EventNoteIcon from '@mui/icons-material/EventNote';
import DateRangeIcon from '@mui/icons-material/DateRange';
import PeopleIcon from '@mui/icons-material/People';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import InventoryIcon from '@mui/icons-material/Inventory';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import SyncIcon from '@mui/icons-material/Sync';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import QueryStatsIcon from '@mui/icons-material/QueryStats';
import NotificationsIcon from '@mui/icons-material/Notifications';
import CampaignIcon from '@mui/icons-material/Campaign';
import { Action } from '@redinfo/shared';
import { MessageKey } from '../i18n/labels';

export interface NavEntry {
  to: string;
  /** Translated at render, in `AppLayout.tsx`'s `NavMenuItem`. */
  label: MessageKey;
  icon: ReactElement;
  /** Any one of these makes the entry visible. Omitted means everyone. */
  requires?: Action[];
  /** The pinned live-mode entry, which renders as a red block. */
  variant?: 'live';
  /** Second line, only used by the live entry. Translated the same way. */
  subtitle?: MessageKey;
}

export interface NavSection {
  /** Rendered as an uppercase subheader. Omitted for the pinned group. */
  label?: MessageKey;
  entries: NavEntry[];
}

/**
 * The single mechanism that decides whether a screen appears in the menu.
 *
 * See #181's approved design for the full navigation model and the rules it
 * carries (a section with no visible entry draws nothing; a route absent from
 * this manifest is reachable but invisible; section order is menu order at
 * every width). Do not reintroduce `RESOURCES_HIDDEN_FROM_MENU` or an
 * enumeration of resource definitions — this file replaces both.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    // Pinned, no subheader: live mode and Home.
    entries: [
      {
        to: '/live',
        label: 'nav.live',
        subtitle: 'nav.liveSubtitle',
        icon: <BoltIcon />,
        requires: [Action.EMERGENCY_OPERATION],
        variant: 'live',
      },
      {
        to: '/',
        label: 'nav.home',
        icon: <HomeIcon />,
      },
    ],
  },
  {
    label: 'nav.myWork',
    entries: [
      {
        to: '/my-availability',
        label: 'nav.myAvailability',
        icon: <EventAvailableIcon />,
        requires: [Action.SUBMIT_AVAILABILITY],
      },
      {
        to: '/my-duties',
        label: 'nav.myDuties',
        icon: <AssignmentIndIcon />,
      },
      {
        to: '/my-hours',
        label: 'nav.myHours',
        icon: <AccessTimeIcon />,
      },
      {
        to: '/my-reports',
        label: 'nav.myReports',
        icon: <ArticleIcon />,
        requires: [Action.CREATE_EVENT_REPORT],
      },
      {
        // Everyone's own alerts area (#165) — ungated, like /my-duties above.
        to: '/my-notices',
        label: 'nav.myNotices',
        icon: <NotificationsIcon />,
      },
    ],
  },
  {
    label: 'nav.operations',
    entries: [
      {
        to: '/live-runs',
        label: 'nav.liveEmergencies',
        icon: <MonitorHeartIcon />,
        requires: [Action.VIEW_LIVE_RUNS],
      },
      {
        // `VIEW_EVENT_REPORTS` is held by every role — the archive is
        // org-wide reading — so this is effectively ungated; kept as a
        // `requires` rather than dropped so a future role missing the
        // action is still handled correctly.
        to: '/event-reports',
        label: 'nav.eventReports',
        icon: <DescriptionIcon />,
        requires: [Action.VIEW_EVENT_REPORTS],
      },
      {
        // Ungated: published schedules are readable by everyone (the
        // service filters drafts to `VIEW_SCHEDULES` holders), same as the
        // event reports archive above.
        to: '/schedules',
        label: 'nav.schedules',
        icon: <EventNoteIcon />,
      },
      {
        to: '/availability-windows',
        label: 'nav.availabilityWindows',
        icon: <DateRangeIcon />,
        requires: [Action.MANAGE_AVAILABILITY_WINDOWS, Action.VIEW_AVAILABILITY_MATRIX],
      },
      {
        to: '/volunteer-hours/review',
        label: 'nav.volunteerHoursReview',
        icon: <FactCheckIcon />,
        requires: [Action.VIEW_VOLUNTEER_HOURS, Action.MANAGE_VOLUNTEER_HOURS],
      },
      {
        // Aggregate, organisation-wide dashboards — every authenticated
        // member sees this, so deliberately no `requires`
        // (docs/plans/estatisticas-dashboards.md §5).
        to: '/statistics',
        label: 'nav.statistics',
        icon: <QueryStatsIcon />,
      },
      {
        // Create/history screen for operational notices (#165).
        to: '/notices',
        label: 'nav.notices',
        icon: <CampaignIcon />,
        requires: [Action.MANAGE_NOTICES],
      },
    ],
  },
  {
    label: 'nav.people',
    entries: [
      {
        to: '/users',
        label: 'nav.personnel',
        icon: <PeopleIcon />,
        requires: [Action.VIEW_USERS],
      },
    ],
  },
  {
    label: 'nav.fleet',
    entries: [
      {
        to: '/vehicles',
        label: 'nav.vehicles',
        icon: <DirectionsCarIcon />,
        requires: [Action.VIEW_VEHICLES],
      },
      {
        to: '/inventory-templates',
        label: 'nav.inventoryTemplates',
        icon: <InventoryIcon />,
        requires: [Action.MANAGE_LOGISTICS],
      },
      {
        to: '/material-items',
        label: 'nav.materialItems',
        icon: <Inventory2Icon />,
        requires: [Action.MANAGE_VEHICLES],
      },
      {
        // The delegation's ambulances on INEM's own portal — availability
        // toggle and INOP reason (#216).
        to: '/inem-status',
        label: 'nav.inemStatus',
        icon: <SyncIcon />,
        requires: [Action.MANAGE_INEM_STATUS],
      },
    ],
  },
  {
    label: 'nav.configuration',
    entries: [
      {
        to: '/hospitals',
        label: 'nav.hospitals',
        icon: <LocalHospitalIcon />,
        requires: [Action.MANAGE_HOSPITALS],
      },
      {
        to: '/holidays',
        label: 'nav.holidays',
        icon: <EventBusyIcon />,
        requires: [Action.MANAGE_HOLIDAYS],
      },
      {
        // Org-wide default delivery channels per notification type (#165).
        to: '/notification-config',
        label: 'nav.notificationConfig',
        icon: <NotificationsIcon />,
        requires: [Action.MANAGE_NOTICES],
      },
    ],
  },
];
