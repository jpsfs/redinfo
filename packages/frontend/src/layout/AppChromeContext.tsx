import { ReactNode, createContext, useContext, useEffect, useState } from 'react';

interface AppChrome {
  hideAppBar: boolean;
  setHideAppBar: (hide: boolean) => void;
}

/**
 * `undefined` outside `AppChromeProvider` (rather than a default object) so
 * `useHideAppBar` can tell "no provider mounted" apart from "provider says
 * don't hide" — a screen under test with no `AppLayout` around it should be
 * a no-op, not a crash.
 */
const AppChromeContext = createContext<AppChrome | undefined>(undefined);

/** Wraps `AppLayout`'s routed content, one level above both the app bar it
 * renders and the screens that can ask it to step aside. */
export const AppChromeProvider = ({ children }: { children: ReactNode }) => {
  const [hideAppBar, setHideAppBar] = useState(false);
  return (
    <AppChromeContext.Provider value={{ hideAppBar, setHideAppBar }}>
      {children}
    </AppChromeContext.Provider>
  );
};

/** Read-only side, used by `AppLayout` itself to decide which app bar to render. */
export const useAppChrome = (): AppChrome => {
  const ctx = useContext(AppChromeContext);
  return ctx ?? { hideAppBar: false, setHideAppBar: () => undefined };
};

/**
 * A screen that draws its own full-width mobile header — currently only the
 * event report wizard on mobile, matching live mode's own header — calls
 * this to ask `AppLayout` to step its own app bar aside while mounted.
 *
 * Takes `hide` as a live argument rather than always registering, so the
 * same call site (`EventReportEditor`, called for both the mobile and
 * desktop layouts) only claims the app bar on the branch that actually
 * draws a competing header — desktop's editor has no header of its own, so
 * it never hides the real one.
 *
 * Deregisters on unmount or once `hide` turns false, so a sibling screen
 * (the type-chooser step before `EventReportEditor` ever mounts, or
 * whatever the crew navigates to next) never inherits a bar this hook
 * hid on its behalf.
 */
export const useHideAppBar = (hide: boolean): void => {
  const ctx = useContext(AppChromeContext);
  useEffect(() => {
    if (!ctx || !hide) return undefined;
    ctx.setHideAppBar(true);
    return () => ctx.setHideAppBar(false);
  }, [ctx, hide]);
};
