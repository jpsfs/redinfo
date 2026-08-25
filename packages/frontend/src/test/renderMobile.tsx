import { ReactElement } from 'react';
import { render, RenderOptions, RenderResult } from '@testing-library/react';
import { AdminContext, testDataProvider } from 'react-admin';
import polyglotI18nProvider from 'ra-i18n-polyglot';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import type { Locale } from '@redinfo/shared';
import { messages } from '../i18n/i18nProvider';
import { theme } from '../layout/theme';

/**
 * Renders a component as a phone renders it.
 *
 * The helper `src/test/setup.ts` has been promising since it was written: its
 * default `matchMedia` answers `false` to everything, which is a desktop, and
 * every screen this repo actually ships to a crew is a phone. A test that mounts
 * the mobile layout by mocking `useIsMobile` proves the layout works; a test that
 * mounts it through a real narrow `matchMedia` proves the *breakpoint* works too,
 * which is what a `Container` or a `useMediaQuery` inside a child component
 * quietly depends on.
 *
 * `matchMedia` is stubbed rather than the hook: MUI's own `useMediaQuery`,
 * `Hidden`, and every `sx` breakpoint read the media query, and mocking one hook
 * leaves those answering for a desktop.
 */

/** Roughly a Pixel in portrait — the device this feature is built for. */
export const MOBILE_WIDTH = 393;

/** Answers `true` for any `max-width` query at or above the phone's width. */
export function stubMobileMatchMedia(width = MOBILE_WIDTH): void {
  window.matchMedia = ((query: string) => {
    const maxWidth = /max-width:\s*([\d.]+)px/.exec(query);
    const minWidth = /min-width:\s*([\d.]+)px/.exec(query);
    let matches = false;
    if (maxWidth) matches = width <= Number(maxWidth[1]);
    else if (minWidth) matches = width >= Number(minWidth[1]);

    return {
      matches,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    };
  }) as unknown as typeof window.matchMedia;
}

export interface RenderMobileOptions extends Omit<RenderOptions, 'wrapper'> {
  /** The initial URL. Live mode keeps its screen in the path, so tests set it. */
  route?: string;
  width?: number;
  /**
   * Defaults to `'pt'` — the production default for a browser with no
   * English preference — so a screen that renders the wrong language is a
   * real test failure rather than a harness artefact. See #180.
   */
  locale?: Locale;
}

/**
 * The wrappers every screen in this app needs: react-admin's context (for
 * `useNotify`, `usePermissions`, `useTranslate` and the data provider), a
 * router, and the real theme — because the theme is where the 44px
 * touch-target floor lives, and a test rendering without it would pass on
 * targets a gloved thumb cannot hit.
 *
 * `MemoryRouter` goes **outside** `AdminContext`: react-admin provides a router
 * of its own inside, and two nested routers is an error rather than a warning.
 */
export function renderMobile(
  ui: ReactElement,
  options: RenderMobileOptions = {},
): RenderResult {
  const { route = '/', width = MOBILE_WIDTH, locale = 'pt', ...rest } = options;
  stubMobileMatchMedia(width);
  const i18nProvider = polyglotI18nProvider(messages, locale);

  return render(ui, {
    wrapper: ({ children }) => (
      <MemoryRouter initialEntries={[route]}>
        <AdminContext dataProvider={testDataProvider()} i18nProvider={i18nProvider}>
          <ThemeProvider theme={theme}>{children}</ThemeProvider>
        </AdminContext>
      </MemoryRouter>
    ),
    ...rest,
  });
}
