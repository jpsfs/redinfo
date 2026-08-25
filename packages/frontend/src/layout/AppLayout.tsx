import { Fragment } from 'react';
import {
  Layout,
  LayoutProps,
  AppBar,
  TitlePortal,
  Menu,
  MenuItemLink,
  MenuItemLinkClasses,
  UserMenu,
  useUserMenu,
  Logout,
  Link,
  useSidebarState,
  useGetIdentity,
} from 'react-admin';
import { Box, Divider, ListSubheader } from '@mui/material';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import { useCapabilities } from '../hooks/useCapabilities';
import { useIsMobile } from '../hooks/useIsMobile';
import { PersonAvatar } from '../components/PersonAvatar';
import { roleLabel } from '../i18n/labels';
import { NAV_SECTIONS, NavEntry } from './navigation';
import {
  borderRadiusMedium,
  colorRedCrossRedDark,
  fontSizeXSmall,
  logoRedCrossEmblemPath,
  touchTargetSize,
} from './design-tokens';

const RedInfoAppBar = () => (
  <AppBar userMenu={<RedInfoUserMenu />}>
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
 * Two-line "Emergência / Modo em campo" block the live entry renders as its
 * `primaryText`. `MenuItemLink` wraps `primaryText` in a MUI `Typography`,
 * which renders a `<p>` — so every element in here has to be inline (`span`),
 * never a `div`, or the DOM ends up with a block element inside a paragraph.
 */
const LiveEntryLabel = ({ label, subtitle }: { label: string; subtitle?: string }) => (
  <Box component="span" sx={{ display: 'inline-block' }}>
    <Box component="span" sx={{ display: 'block', fontWeight: 700, fontSize: '0.9375rem', lineHeight: 1.2 }}>
      {label}
    </Box>
    {subtitle && (
      <Box component="span" sx={{ display: 'block', fontSize: '0.6875rem', opacity: 0.85, lineHeight: 1.2 }}>
        {subtitle}
      </Box>
    )}
  </Box>
);

const NavMenuItem = ({ entry }: { entry: NavEntry }) => (
  <MenuItemLink
    to={entry.to}
    primaryText={
      entry.variant === 'live' ? (
        <LiveEntryLabel label={entry.label} subtitle={entry.subtitle} />
      ) : (
        entry.label
      )
    }
    leftIcon={entry.icon}
    sx={[
      { minHeight: touchTargetSize },
      entry.variant === 'live'
        ? {
            backgroundColor: colorRedCrossRedDark,
            color: 'common.white',
            borderRadius: `${borderRadiusMedium}px`,
            mx: 1,
            minHeight: 52,
            [`& .${MenuItemLinkClasses.icon}`]: { color: 'common.white' },
            '&:hover': { backgroundColor: colorRedCrossRedDark, opacity: 0.9 },
          }
        : {
            [`&.${MenuItemLinkClasses.active}`]: {
              backgroundColor: 'rgba(237,27,36,0.08)',
              color: colorRedCrossRedDark,
              [`& .${MenuItemLinkClasses.icon}`]: { color: colorRedCrossRedDark },
            },
          },
    ]}
  />
);

/** Uppercase, non-collapsible section label. Never sticky — this is a short drawer, not a long list. */
const SectionSubheader = ({ label }: { label: string }) => (
  <ListSubheader
    disableSticky
    sx={{
      backgroundColor: 'transparent',
      fontSize: fontSizeXSmall,
      fontWeight: 600,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      color: 'text.secondary',
      lineHeight: '32px',
    }}
  >
    {label}
  </ListSubheader>
);

/** Identity block shown at the top of the drawer on mobile, where there is no app bar user menu in reach. */
const MobileIdentityHeader = () => {
  const { identity } = useGetIdentity();
  if (!identity) return null;

  const initials = `${identity.firstName?.[0] ?? ''}${identity.lastName?.[0] ?? ''}`;

  return (
    <Box
      component={Link}
      to="/my-profile"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        p: 2,
        mb: 1,
        backgroundColor: colorRedCrossRedDark,
        color: 'common.white',
        textDecoration: 'none',
      }}
    >
      <PersonAvatar
        userId={String(identity.id)}
        hasPhoto={Boolean(identity.hasPhoto)}
        initials={initials}
        size={48}
      />
      <Box sx={{ minWidth: 0 }}>
        <Box sx={{ fontWeight: 700, fontSize: '0.9375rem', lineHeight: 1.3 }}>
          {identity.fullName}
        </Box>
        <Box sx={{ fontSize: fontSizeXSmall, opacity: 0.85 }}>{roleLabel(identity.role)}</Box>
      </Box>
    </Box>
  );
};

/**
 * The single mechanism that decides what appears in the drawer.
 *
 * Walks `NAV_SECTIONS` (see `layout/navigation.tsx`), keeping only the
 * entries the viewer's role can reach and dropping any section left with
 * zero entries — including its subheader — entirely. Renders nothing at all
 * while the role is still loading, rather than flashing every entry and then
 * trimming half of them.
 */
export const RedInfoMenu = () => {
  const { can, isPending } = useCapabilities();
  const [sidebarOpen] = useSidebarState();
  const isMobile = useIsMobile();

  if (isPending) return null;

  const sections = NAV_SECTIONS.map((section) => ({
    ...section,
    entries: section.entries.filter((entry) => can(entry.requires)),
  })).filter((section) => section.entries.length > 0);

  return (
    <Menu>
      {isMobile && <MobileIdentityHeader />}
      {sections.map((section, index) => (
        // A Fragment, not a Box: `Menu` renders a MUI `MenuList`, and wrapping
        // a section's items in an extra DOM node would break its keyboard
        // navigation between items.
        <Fragment key={section.label ?? `pinned-${index}`}>
          {section.label &&
            (sidebarOpen ? (
              <SectionSubheader label={section.label} />
            ) : (
              <Divider sx={{ my: 1 }} />
            ))}
          {section.entries.map((entry) => (
            <NavMenuItem key={entry.to} entry={entry} />
          ))}
        </Fragment>
      ))}
    </Menu>
  );
};

/** `MenuItemLink` doesn't know it's sitting inside a `UserMenu` popover, so it has to be told to close it. */
const MyProfileMenuItem = () => {
  const userMenu = useUserMenu();
  return (
    <MenuItemLink
      to="/my-profile"
      primaryText="My Profile"
      leftIcon={<AccountCircleIcon />}
      onClick={userMenu?.onClose}
    />
  );
};

/**
 * My Profile and Log out, moved here from the drawer per #181's approved
 * design — they are account actions, not places to navigate to.
 */
const RedInfoUserMenu = () => {
  const { identity } = useGetIdentity();
  const initials = `${identity?.firstName?.[0] ?? ''}${identity?.lastName?.[0] ?? ''}`;

  return (
    <UserMenu
      icon={
        <PersonAvatar
          userId={identity ? String(identity.id) : ''}
          hasPhoto={Boolean(identity?.hasPhoto)}
          initials={initials}
          size={32}
        />
      }
    >
      {identity && (
        <Box sx={{ px: 2, py: 1.5, minWidth: 200 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <PersonAvatar
              userId={String(identity.id)}
              hasPhoto={Boolean(identity.hasPhoto)}
              initials={initials}
              size={40}
            />
            <Box sx={{ minWidth: 0 }}>
              <Box sx={{ fontWeight: 600, fontSize: '0.9375rem' }}>{identity.fullName}</Box>
              <Box sx={{ fontSize: fontSizeXSmall, color: 'text.secondary' }}>
                {roleLabel(identity.role)}
              </Box>
            </Box>
          </Box>
        </Box>
      )}
      <Divider />
      <MyProfileMenuItem />
      <Divider />
      <Logout />
    </UserMenu>
  );
};

export const AppLayout = (props: LayoutProps) => (
  <Layout {...props} appBar={RedInfoAppBar} menu={RedInfoMenu} />
);
