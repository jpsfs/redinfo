/**
 * Registers the service worker, or quietly does not.
 *
 * Not in development: a cached shell is exactly the wrong thing while the shell
 * changes on every save, and "why is my change not showing" is a whole afternoon
 * nobody gets back.
 *
 * Every failure is swallowed. A service worker is how the app opens offline; it
 * is not how the app works, and a registration that fails on an http origin or
 * under a policy that forbids it must not put anything in front of a crew.
 */
export function registerServiceWorker(): void {
  if (import.meta.env.DEV) return;
  if (!('serviceWorker' in navigator)) return;

  // After `load`, so registering never competes with the first paint on the
  // 3G connection this is built for.
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
