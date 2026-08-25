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
import { ROLE_METADATA, UserRole } from '@redinfo/shared';
import { useCapabilities } from '../hooks/useCapabilities';
import { useIsMobile } from '../hooks/useIsMobile';
import { PersonAvatar } from '../components/PersonAvatar';
import { NAV_SECTIONS, NavEntry } from './navigation';
import {
  borderRadiusMedium,
  colorRedCrossRedDark,
  fontSizeXSmall,
  logoRedCrossEmblemPath,
  touchTargetSize,
} from './design-tokens';

/**
 * `identity.role` is a `UserRole` account role (`SYSTEM_ADMIN`,
 * `EMERGENCY_COORDINATOR`, …) — a different vocabulary from `i18n/labels.ts`'s
 * `roleLabel`, which names a *shift* role ("Driver", "Team Leader"). Reuses
 * `ROLE_METADATA`, the same lookup `UserList`/`UserEdit`/`UserCreate` already
 * use for it, so this doesn't invent a second display name for the same enum.
 */
const identityRoleLabel = (role?: string | null): string =>
  (role && ROLE_METADATA[role as UserRole]?.displayName) || role || '';

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

/**
 * The live entry's icon, collapsed-rail version: a contained circular red
 * badge instead of the full-width pill. The pill's `mx` margin plus its
 * background color don't survive the 55px rail — `MenuItemLink`'s label
 * `Typography` keeps its full (invisible, `noWrap`-clipped) content width in
 * the layout even though no text is visible, so a background spanning the
 * whole row rides past the rail's edge and gets clipped square, losing the
 * rounding and the margin both. Coloring only the icon sidesteps that: it
 * sits inside `ListItemIcon`'s fixed-width slot, which never overflows.
 */
const LiveEntryIcon = ({ icon }: { icon: NavEntry['icon'] }) => (
  <Box
    sx={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 32,
      height: 32,
      borderRadius: '50%',
      backgroundColor: colorRedCrossRedDark,
      color: 'common.white',
    }}
  >
    {icon}
  </Box>
);

const NavMenuItem = ({ entry }: { entry: NavEntry }) => {
  const [sidebarOpen] = useSidebarState();
  const isLive = entry.variant === 'live';

  return (
    <MenuItemLink
      to={entry.to}
      primaryText={isLive ? <LiveEntryLabel label={entry.label} subtitle={entry.subtitle} /> : entry.label}
      leftIcon={isLive && !sidebarOpen ? <LiveEntryIcon icon={entry.icon} /> : entry.icon}
      sx={[
        { minHeight: touchTargetSize },
        isLive && sidebarOpen
          ? {
              backgroundColor: colorRedCrossRedDark,
              color: 'common.white',
              borderRadius: `${borderRadiusMedium}px`,
              // `mx: 1` insets the pill from the drawer edges, but it shifts
              // the whole row right — including the icon column, which every
              // other entry keeps flush at the default 16px padding.
              // Trimming `pl` by the same 8px it added keeps the icon lined
              // up with Home's, right below it.
              mx: 1,
              pl: 1,
              mb: 1,
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
};

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
        <Box sx={{ fontSize: fontSizeXSmall, opacity: 0.85 }}>{identityRoleLabel(identity.role)}</Box>
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
        // MUI's Button styles its `startIcon` slot with
        // `.MuiButton-startIcon > *:nth-of-type(1) { font-size: <n> }` —
        // aimed at sizing a plain SvgIcon, but it matches *any* direct
        // child, including our Avatar, and its specificity beats a plain
        // sx class, so it was overriding PersonAvatar's own font-size and
        // rendering the initials oversized. Wrapping in a span keeps the
        // Avatar one level deeper, out of that selector's reach.
        <Box component="span" sx={{ display: 'inline-flex' }}>
          <PersonAvatar
            userId={identity ? String(identity.id) : ''}
            hasPhoto={Boolean(identity?.hasPhoto)}
            initials={initials}
            size={32}
          />
        </Box>
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
                {identityRoleLabel(identity.role)}
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
