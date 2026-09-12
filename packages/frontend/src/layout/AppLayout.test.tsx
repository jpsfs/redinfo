import { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { AdminContext, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { UserRole } from '@redinfo/shared';
import { messages } from '../i18n/i18nProvider';
import { renderMobile, stubMobileMatchMedia } from '../test/renderMobile';
import { theme } from './theme';
import { useHideAppBar } from './AppChromeContext';
import { AppLayout, RedInfoMenu, RedInfoSidebar } from './AppLayout';

/**
 * Pinned to English: this file's assertions predate #180 and check the
 * pre-translation strings, which are what `messagesFor('en')` still holds —
 * see `i18n/labels.ts`. What is under test here is which routes a role sees,
 * not which language they see them in.
 */
const i18nProvider = polyglotI18nProvider(messages, 'en');

/**
 * `usePermissions` is async, so a synchronous `getAllByRole` would see the
 * `isPending` `null` render and fail — every case here awaits
 * `findAllByRole` for that reason.
 *
 * Cleans up before rendering, not only after: a case that renders more than
 * once (`never puts My Profile...` below) would otherwise query across every
 * menu it has mounted so far, not just the latest one.
 */
async function renderMenuAs(roles: UserRole[] | null): Promise<string[]> {
  cleanup();
  const authProvider = {
    login: () => Promise.resolve(),
    logout: () => Promise.resolve(),
    checkAuth: () => Promise.resolve(),
    checkError: () => Promise.resolve(),
    getPermissions: () => Promise.resolve(roles),
  };

  render(
    <AdminContext
      dataProvider={testDataProvider()}
      authProvider={authProvider}
      i18nProvider={i18nProvider}
    >
      <RedInfoMenu />
    </AdminContext>,
  );

  const items = await screen.findAllByRole('menuitem');
  return items.map((item) => (item.getAttribute('href') ?? '').replace(/^#/, ''));
}

describe('RedInfoMenu', () => {
  it('gives an Emergency Operational exactly the field-crew entries, live mode first', async () => {
    const links = await renderMenuAs([UserRole.EMERGENCY_OPERATIONAL]);
    expect(links).toEqual([
      '/live',
      '/',
      '/my-availability',
      '/my-duties',
      '/my-hours',
      '/my-reports',
      '/my-notices',
      '/ai-connections',
      // Org-wide reading — see the matching note in navigation.test.tsx.
      '/event-reports',
      '/schedules',
      '/statistics',
      '/vehicles',
      // The crew on shift is who actually knows a unit is out of service (#216).
      '/inem-status',
    ]);
  });

  it('gives a Logistics Coordinator exactly thirteen entries and no live mode', async () => {
    // Thirteen, not seven — see the matching note in navigation.test.tsx.
    const links = await renderMenuAs([UserRole.LOGISTICS_COORDINATOR]);
    expect(links).toEqual([
      '/',
      '/my-duties',
      '/my-hours',
      '/my-notices',
      '/ai-connections',
      '/event-reports',
      '/schedules',
      '/statistics',
      '/notices',
      '/vehicles',
      '/inventory-templates',
      '/material-items',
      '/notification-config',
    ]);
  });

  it('gives an Emergency Coordinator every operational and configuration entry, including Holidays', async () => {
    const links = await renderMenuAs([UserRole.EMERGENCY_COORDINATOR]);
    expect(links).toEqual([
      '/live',
      '/',
      '/my-availability',
      '/my-duties',
      '/my-hours',
      '/my-reports',
      '/my-notices',
      '/ai-connections',
      '/live-runs',
      '/event-reports',
      '/schedules',
      '/availability-windows',
      '/volunteer-hours/review',
      '/statistics',
      '/notices',
      '/users',
      '/vehicles',
      // Not '/inventory-templates': ROLE_PERMISSIONS does not give this role
      // MANAGE_LOGISTICS. See navigation.test.tsx for the note on this gap
      // against the approved design's entry-count table.
      // '/material-items' IS included, unlike '/inventory-templates' above:
      // it's gated on MANAGE_VEHICLES (#206), which this role does hold.
      '/material-items',
      // The crew on shift is who actually knows a unit is out of service (#216).
      '/inem-status',
      '/facilities',
      '/holidays',
      '/notification-config',
    ]);
  });

  it('gives a System Admin every entry in the manifest', async () => {
    const links = await renderMenuAs([UserRole.SYSTEM_ADMIN]);
    expect(links).toEqual([
      '/live',
      '/',
      '/my-availability',
      '/my-duties',
      '/my-hours',
      '/my-reports',
      '/my-notices',
      '/ai-connections',
      '/live-runs',
      '/event-reports',
      '/schedules',
      '/availability-windows',
      '/volunteer-hours/review',
      '/statistics',
      '/notices',
      '/users',
      '/vehicles',
      '/inventory-templates',
      '/material-items',
      '/inem-status',
      '/facilities',
      '/holidays',
      '/notification-config',
    ]);
  });

  it('never puts My Profile in the drawer, for any role', async () => {
    const linksByRole = [];
    for (const role of Object.values(UserRole)) {
      linksByRole.push(await renderMenuAs([role]));
    }
    linksByRole.forEach((links) => expect(links).not.toContain('/my-profile'));
  });

  it('draws no subheader for a section left with zero visible entries', async () => {
    await renderMenuAs([UserRole.EMERGENCY_OPERATIONAL]);
    // Not 'Operations': Statistics carries no `requires` (every authenticated
    // member sees it — docs/plans/estatisticas-dashboards.md §5), so that
    // section is never empty any more.
    expect(screen.queryByText('People')).not.toBeInTheDocument();
    expect(screen.queryByText('Configuration')).not.toBeInTheDocument();
    // Sections the role does have entries in still get their subheader.
    expect(screen.getByText('My work')).toBeInTheDocument();
    expect(screen.getByText('Operations')).toBeInTheDocument();
  });
});

describe('RedInfoSidebar', () => {
  // Regression for the mobile drawer growing past the visible viewport once
  // the menu outgrows one screen — see the rationale on `RedInfoSidebar`
  // itself. jsdom's CSS engine never evaluates `@media` blocks for
  // `getComputedStyle` (it just ignores them), so the only thing a jsdom test
  // can check is that the emitted stylesheet carries the fix, not that it's
  // "live" on the element — that part is a manual/visual check on a phone.
  it('emits the viewport-cap and scroll-containment rule for the mobile drawer paper', () => {
    renderMobile(
      <RedInfoSidebar open appBarAlwaysOn={false}>
        <div>menu content</div>
      </RedInfoSidebar>,
    );

    const paper = document.querySelector('.MuiDrawer-paper');
    expect(paper).not.toBeNull();

    const emittedCss = Array.from(document.querySelectorAll('style'))
      .map((el) => el.textContent)
      .join('\n');
    expect(emittedCss).toMatch(/max-height:\s*100dvh/);
    expect(emittedCss).toMatch(/overflow-y:\s*auto/);
    expect(emittedCss).toMatch(/overscroll-behavior:\s*contain/);
  });
});

/** A screen that draws its own header, standing in for `EventReportEditor`'s mobile layout. */
const HideAppBarProbe = ({ hide }: { hide: boolean }) => {
  useHideAppBar(hide);
  return <div>page content</div>;
};

/**
 * The full `<Layout>` (`RedInfoMenu`'s parent), so `getPermissions` and
 * `getIdentity` both need answering — unlike `renderMenuAs` above, a bare
 * object with only `getPermissions` is enough: `useGetIdentity` checks
 * `typeof authProvider.getIdentity === 'function'` before calling it and
 * degrades to an empty identity otherwise.
 *
 * Passed as `render`'s `wrapper`, not inlined into the element tree, so
 * `rerender` (used below to check the app bar comes back on unmount) keeps
 * every provider in place and only swaps `AppLayout`'s children.
 */
function AppLayoutProviders({ children }: { children: ReactNode }) {
  const authProvider = {
    login: () => Promise.resolve(),
    logout: () => Promise.resolve(),
    checkAuth: () => Promise.resolve(),
    checkError: () => Promise.resolve(),
    getPermissions: () => Promise.resolve([UserRole.EMERGENCY_OPERATIONAL]),
  };
  const i18nProvider = polyglotI18nProvider(messages, 'en');

  return (
    <MemoryRouter>
      <AdminContext
        dataProvider={testDataProvider()}
        authProvider={authProvider}
        i18nProvider={i18nProvider}
      >
        <ThemeProvider theme={theme}>{children}</ThemeProvider>
      </AdminContext>
    </MemoryRouter>
  );
}

function renderAppLayoutWith(children: ReactNode, width?: number) {
  cleanup();
  stubMobileMatchMedia(width);
  return render(<AppLayout>{children}</AppLayout>, { wrapper: AppLayoutProviders });
}

describe('AppLayout — a screen with its own header can hide the app bar', () => {
  // #enhancement: EventReportEditor draws its own sticky app bar on mobile
  // (step title, progress bar) — same idea as live mode's own header. Left
  // stacked under RedInfoAppBar, the wizard read as two top bars where live
  // mode has one. `useHideAppBar` is the (route-independent) signal a screen
  // uses to ask for the real one to step aside — see `AppChromeContext.tsx`.
  it('hides the app bar and drawer trigger once a mounted screen asks for it', () => {
    renderAppLayoutWith(<HideAppBarProbe hide />);
    expect(document.querySelector('.MuiAppBar-root')).not.toBeInTheDocument();
    expect(document.querySelector('.layout')).toHaveClass('redinfo-no-app-bar');
  });

  it('keeps the app bar when the mounted screen does not ask (e.g. desktop, or before a type is chosen)', () => {
    renderAppLayoutWith(<HideAppBarProbe hide={false} />);
    expect(document.querySelector('.MuiAppBar-root')).toBeInTheDocument();
  });

  it('restores the app bar once the requesting screen unmounts', () => {
    const { rerender } = renderAppLayoutWith(<HideAppBarProbe hide />);
    expect(document.querySelector('.MuiAppBar-root')).not.toBeInTheDocument();

    rerender(<AppLayout>{null}</AppLayout>);
    expect(document.querySelector('.MuiAppBar-root')).toBeInTheDocument();
  });
});
