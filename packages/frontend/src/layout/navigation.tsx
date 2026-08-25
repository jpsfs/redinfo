import { ReactElement } from 'react';
import BoltIcon from '@mui/icons-material/Bolt';
import HomeIcon from '@mui/icons-material/Home';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import AssignmentIndIcon from '@mui/icons-material/AssignmentInd';
import ArticleIcon from '@mui/icons-material/Article';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import DescriptionIcon from '@mui/icons-material/Description';
import EventNoteIcon from '@mui/icons-material/EventNote';
import DateRangeIcon from '@mui/icons-material/DateRange';
import PeopleIcon from '@mui/icons-material/People';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import InventoryIcon from '@mui/icons-material/Inventory';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import { Action } from '@redinfo/shared';

export interface NavEntry {
  to: string;
  /**
   * English label typed inline, per the convention in `i18n/labels.ts`.
   * #180 turns these into translation keys — one file to change.
   */
  label: string;
  icon: ReactElement;
  /** Any one of these makes the entry visible. Omitted means everyone. */
  requires?: Action[];
  /** The pinned live-mode entry, which renders as a red block. */
  variant?: 'live';
  /** Second line, only used by the live entry. */
  subtitle?: string;
}

export interface NavSection {
  /** Rendered as an uppercase subheader. Omitted for the pinned group. */
  label?: string;
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
        label: 'Emergência',
        subtitle: 'Modo em campo',
        icon: <BoltIcon />,
        requires: [Action.EMERGENCY_OPERATION],
        variant: 'live',
      },
      {
        to: '/',
        label: 'Home',
        icon: <HomeIcon />,
      },
    ],
  },
  {
    label: 'My work',
    entries: [
      {
        to: '/my-availability',
        label: 'My Availability',
        icon: <EventAvailableIcon />,
        requires: [Action.SUBMIT_AVAILABILITY],
      },
      {
        to: '/my-duties',
        label: 'My Duties',
        icon: <AssignmentIndIcon />,
      },
      {
        to: '/my-reports',
        label: 'My Reports',
        icon: <ArticleIcon />,
        requires: [Action.CREATE_EVENT_REPORT],
      },
    ],
  },
  {
    label: 'Operations',
    entries: [
      {
        to: '/live-runs',
        label: 'Live Emergencies',
        icon: <MonitorHeartIcon />,
        requires: [Action.VIEW_LIVE_RUNS],
      },
      {
        to: '/event-reports',
        label: 'Event Reports',
        icon: <DescriptionIcon />,
        requires: [Action.VIEW_EVENT_REPORTS],
      },
      {
        to: '/schedules',
        label: 'Schedules',
        icon: <EventNoteIcon />,
        requires: [Action.VIEW_SCHEDULES],
      },
      {
        to: '/availability-windows',
        label: 'Availability Windows',
        icon: <DateRangeIcon />,
        requires: [Action.MANAGE_AVAILABILITY_WINDOWS, Action.VIEW_AVAILABILITY_MATRIX],
      },
    ],
  },
  {
    label: 'People',
    entries: [
      {
        to: '/users',
        label: 'Personnel',
        icon: <PeopleIcon />,
        requires: [Action.VIEW_USERS],
      },
    ],
  },
  {
    label: 'Fleet',
    entries: [
      {
        to: '/vehicles',
        label: 'Vehicles',
        icon: <DirectionsCarIcon />,
        requires: [Action.VIEW_VEHICLES],
      },
      {
        to: '/inventory-templates',
        label: 'Inventory Templates',
        icon: <InventoryIcon />,
        requires: [Action.MANAGE_LOGISTICS],
      },
    ],
  },
  {
    label: 'Configuration',
    entries: [
      {
        to: '/hospitals',
        label: 'Hospitals',
        icon: <LocalHospitalIcon />,
        requires: [Action.MANAGE_HOSPITALS],
      },
      {
        to: '/holidays',
        label: 'Holidays',
        icon: <EventBusyIcon />,
        requires: [Action.MANAGE_HOLIDAYS],
      },
    ],
  },
];
