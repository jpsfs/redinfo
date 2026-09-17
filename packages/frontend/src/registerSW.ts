/**
 * Registers the service worker, or quietly does not.
 *
 * Registration itself happens in dev too — otherwise Web Push (permission
 * prompt, subscribe button) is untestable in the only stack this repo runs
 * locally (`docker compose up` serves the frontend via `pnpm dev`). What dev
 * must not get is the *cached shell*: it changes on every save, and "why is
 * my change not showing" is a whole afternoon nobody gets back. So `sw.js` is
 * registered with a `?dev=1` marker it reads off its own URL to skip shell
 * caching while still handling `push`/`notificationclick` — see sw.js.
 *
 * Every failure is swallowed. A service worker is how the app opens offline; it
 * is not how the app works, and a registration that fails on an http origin or
 * under a policy that forbids it must not put anything in front of a crew.
 */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;

  const swUrl = import.meta.env.DEV ? '/sw.js?dev=1' : '/sw.js';

  // After `load`, so registering never competes with the first paint on the
  // 3G connection this is built for.
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(swUrl).catch(() => undefined);
  });
}
