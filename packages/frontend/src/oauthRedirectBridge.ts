/**
 * Bridges a *path*-shaped OAuth redirect onto the hash route the app actually
 * serves, before React mounts.
 *
 * `<Admin>` (react-admin 5) mounts a HashRouter, so `/auth/callback` is not a
 * route — it is a path the router never sees. A browser landing there gets
 * `index.html` from nginx, the router boots on an empty hash, resolves `/`,
 * and (unauthenticated) replaces the location with `#/login`. The tokens are
 * still in the query string, but `OAuthCallback` never mounted to read them,
 * so the user is left staring at the login screen with a URL full of JWTs.
 *
 * The backend now redirects to `/#/auth/callback?...` directly
 * (`AuthController.frontendRoute`), so this only has to cover the cases where
 * the two halves disagree: a backend that has not been redeployed yet, a
 * provider console still holding an old redirect URI, or a stuck URL someone
 * reloads. It is deliberately narrow — `/auth/callback` is the SPA's own
 * route and holds nothing else, so rewriting it is unambiguous even when a
 * `#/login` the router just added is already sitting on the end.
 *
 * Runs before `createRoot` so the router reads the corrected location on its
 * first render and no redirect-to-login flashes in between.
 */
export const OAUTH_CALLBACK_PATH = '/auth/callback';

export function bridgeOAuthRedirectToHashRoute(): boolean {
  const { pathname, search, origin } = window.location;
  if (pathname.replace(/\/+$/, '') !== OAUTH_CALLBACK_PATH) return false;

  // Carry the query into the fragment and drop it from the path, so the
  // tokens are not left duplicated in a place the router does not read.
  window.history.replaceState(null, '', `${origin}/#${OAUTH_CALLBACK_PATH}${search}`);
  return true;
}
