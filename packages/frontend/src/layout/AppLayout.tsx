import {
  Layout,
  LayoutProps,
  AppBar,
  TitlePortal,
  Menu,
  useResourceDefinitions,
} from 'react-admin';
import { Box, Divider } from '@mui/material';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import { logoRedCrossEmblemPath } from './design-tokens';

const RedInfoAppBar = () => (
  <AppBar>
    <Box
      component="img"
      src={logoRedCrossEmblemPath}
      alt="Cruz Vermelha Portuguesa"
      aria-label="Cruz Vermelha Portuguesa emblem"
      sx={{ height: 32, width: 32, mr: 1.5, flexShrink: 0 }}
    />
    <TitlePortal />
    <Box sx={{ flex: 1 }} />
  </AppBar>
);

/**
 * Resources that have their own screens but no top-level menu entry, because
 * they are only ever reached from the screen that gives them context.
 */
const RESOURCES_HIDDEN_FROM_MENU = [
  // Holidays are edited while setting up a window (a holiday doubles that day's
  // shifts), so they hang off Availability Windows rather than standing alone.
  'holidays',
];

/**
 * Resources are listed automatically, minus the ones above; "My availability"
 * is a custom route (a personal action page, not a resource) so it needs its
 * own entry.
 */
export const RedInfoMenu = () => {
  const resources = useResourceDefinitions();

  return (
    <Menu>
      <Menu.DashboardItem />
      {Object.keys(resources)
        .filter(
          (name) =>
            resources[name].hasList && !RESOURCES_HIDDEN_FROM_MENU.includes(name),
        )
        .map((name) => (
          <Menu.ResourceItem key={name} name={name} />
        ))}
      <Divider sx={{ my: 1 }} />
      <Menu.Item
        to="/my-availability"
        primaryText="My Availability"
        leftIcon={<EventAvailableIcon />}
      />
    </Menu>
  );
};

export const AppLayout = (props: LayoutProps) => (
  <Layout {...props} appBar={RedInfoAppBar} menu={RedInfoMenu} />
);
