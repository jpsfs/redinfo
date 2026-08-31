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
  Sidebar,
  SidebarProps,
  useSidebarState,
  useGetIdentity,
  useLocales,
  LocalesMenuButton,
  LoadingIndicator,
} from 'react-admin';
import { Box, Divider, ListSubheader } from '@mui/material';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import { useCapabilities } from '../hooks/useCapabilities';
import { useIsMobile } from '../hooks/useIsMobile';
import { PersonAvatar } from '../components/PersonAvatar';
import { accountRoleLabel, Translate } from '../i18n/labels';
import { useT } from '../i18n/useT';
import { NAV_SECTIONS, NavEntry } from './navigation';
import {
  borderRadiusMedium,
  colorRedCrossRedDark,
  fontSizeXSmall,
  logoRedCrossEmblemPath,
  touchTargetSize,
} from './design-tokens';

/**
 * `identity.roles` is the `UserRole[]` set this person holds (`SYSTEM_ADMIN`,
 * `EMERGENCY_COORDINATOR`, …) — a different vocabulary from `i18n/labels.ts`'s
 * `roleLabel`, which names a *shift* role ("Driver", "Team Leader"). Reuses
 * `accountRoleLabel`, the same lookup `UserList`/`UserEdit`/`UserCreate` already
 * use for it, so this doesn't invent a second display name for the same enum.
 * Joined rather than picking one — multi-role means there is no single "the"
 * role to show (#multi-role).
 */
const identityRoleLabel = (t: Translate, roles?: string[] | null): string =>
  roles?.length ? roles.map((role) => accountRoleLabel(t, role)).join(' · ') : '';

/**
 * react-admin's default toolbar (language picker + refresh), but dropped on
 * mobile entirely: language now lives on the My Profile page (see
 * `MyProfilePage.tsx`), and a manual refresh button is redundant there — the
 * mobile browser's own pull-to-refresh already reloads the page. Keeps the
 * mobile header bar down to the sidebar toggle, title, and the user-menu
 * avatar.
 */
const RedInfoAppBarToolbar = () => {
  const isMobile = useIsMobile();
  const locales = useLocales();
  if (isMobile) return null;
  return (
    <>
      {locales && locales.length > 1 && <LocalesMenuButton />}
      <LoadingIndicator />
    </>
  );
};

const RedInfoAppBar = () => (
  <AppBar userMenu={<RedInfoUserMenu />} toolbar={<RedInfoAppBarToolbar />}>
    <Box
      component="img"
      src={logoRedCrossEmblemPath}
      alt="Cruz Vermelha Portuguesa"
      aria-label="Cruz Vermelha Portuguesa emblem"
      sx={{ height: 32, width: 32, mr: 1.5, flexShrink: 0 }}
    />
    <TitlePortal />
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
  const t = useT();
  const isLive = entry.variant === 'live';
  const label = t(entry.label);
  const subtitle = entry.subtitle && t(entry.subtitle);

  return (
    <MenuItemLink
      to={entry.to}
      primaryText={isLive ? <LiveEntryLabel label={label} subtitle={subtitle} /> : label}
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
  const t = useT();
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
        <Box sx={{ fontSize: fontSizeXSmall, opacity: 0.85 }}>{identityRoleLabel(t, identity.roles)}</Box>
      </Box>
    </Box>
  );
};

/**
 * Wraps react-admin's `Sidebar` to fix mobile drawer scrolling once the menu
 * has more entries than fit one screen (#210, #165 both added sections — a
 * System Admin now sees 21 entries).
 *
 * react-admin sizes the mobile (`xs`) drawer paper with `height: '100vh'`.
 * `100vh` is the *layout* viewport — on iOS/Android it's taller than what's
 * actually visible whenever the browser chrome (address bar) is on screen —
 * so the paper extends past the fold, which reads as "the page is bigger
 * than it should be". Swapping in `100dvh` (the *dynamic*, currently-visible
 * viewport) caps it at what's actually on screen.
 *
 * That alone doesn't fix "scroll doesn't work well": once the paper's own
 * list is scrolled to its end, iOS chains the gesture to whatever is
 * scrollable underneath (the app body), so a swipe inside the drawer is felt
 * as the page behind it moving. `overscrollBehavior: 'contain'` stops the
 * scroll at the drawer's own edge instead of leaking to the page.
 *
 * Scoped to the `sm`-down breakpoint so the desktop permanent rail — sized
 * and scrolled by its own `.RaSidebar-fixed` wrapper, not this paper — is
 * untouched.
 */
export const RedInfoSidebar = (props: SidebarProps) => (
  <Sidebar
    {...props}
    sx={(theme) => ({
      [theme.breakpoints.down('sm')]: {
        '& .MuiPaper-root': {
          height: '100dvh',
          maxHeight: '100dvh',
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          WebkitOverflowScrolling: 'touch',
        },
      },
    })}
  />
);

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
  const t = useT();

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
              <SectionSubheader label={t(section.label)} />
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
  const t = useT();
  return (
    <MenuItemLink
      to="/my-profile"
      primaryText={t('nav.myProfile')}
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
  const t = useT();
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
                {identityRoleLabel(t, identity.roles)}
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
  <Layout {...props} appBar={RedInfoAppBar} menu={RedInfoMenu} sidebar={RedInfoSidebar} />
);
