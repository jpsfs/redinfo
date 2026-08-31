/**
 * Where the access/refresh tokens live — "keep me signed in" toggles between
 * the two Web Storage areas rather than anything about the tokens
 * themselves:
 *
 * - remembered → `localStorage`, survives closing the browser (this was
 *   already every login's behaviour before the checkbox existed).
 * - not remembered → `sessionStorage`, gone as soon as the tab/browser
 *   closes — for a shared or public computer.
 *
 * The backend mirrors this with a longer-lived refresh token when
 * `remember` is true (see `AuthService.generateTokens`), so a remembered
 * session both survives the browser closing *and* keeps renewing itself for
 * longer between visits.
 */
const TOKEN_KEY = 'redinfo_access_token';
const REFRESH_KEY = 'redinfo_refresh_token';

/** Whichever storage currently holds a session, `localStorage` if neither does. */
function activeStorage(): Storage {
  return sessionStorage.getItem(REFRESH_KEY) !== null ? sessionStorage : localStorage;
}

/** Starts a new session, replacing anything left behind in the other storage area. */
export function setTokens(accessToken: string, refreshToken: string, remember: boolean): void {
  const [target, other] = remember ? [localStorage, sessionStorage] : [sessionStorage, localStorage];
  other.removeItem(TOKEN_KEY);
  other.removeItem(REFRESH_KEY);
  target.setItem(TOKEN_KEY, accessToken);
  target.setItem(REFRESH_KEY, refreshToken);
}

/** Rewrites both tokens in place after a refresh rotation, keeping the session's storage area. */
export function updateTokens(accessToken: string, refreshToken: string): void {
  const store = activeStorage();
  store.setItem(TOKEN_KEY, accessToken);
  store.setItem(REFRESH_KEY, refreshToken);
}

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY) ?? sessionStorage.getItem(REFRESH_KEY);
}

export function clearTokens(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(REFRESH_KEY);
}
