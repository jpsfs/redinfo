import { getRefreshToken, updateTokens, clearTokens } from './authStorage';

const API_URL = import.meta.env.VITE_API_URL ?? '';

let pending: Promise<string | null> | null = null;

/**
 * Exchanges the current refresh token for a new access/refresh pair.
 *
 * The access token is short-lived (15 minutes) and nothing polls for its
 * expiry while a person stays on one screen — without this, a request fired
 * after that window hits a plain 401 and looks indistinguishable from "not
 * logged in", even though the (still valid) refresh token could have
 * renewed it. `apiFetch`/`apiUpload`/`apiDownload` and the data provider's
 * `httpClient` all call this once on a 401 before giving up.
 *
 * De-duplicated via `pending`: several requests can 401 around the same
 * moment (e.g. a screen that fires a few calls on mount), and they should
 * share one refresh round-trip rather than each racing the rotating
 * refresh token against the others.
 */
export function refreshAccessToken(): Promise<string | null> {
  if (!pending) {
    pending = doRefresh().finally(() => {
      pending = null;
    });
  }
  return pending;
}

async function doRefresh(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) {
    // Expired or revoked — nothing left to renew with, callers fall back to
    // their normal unauthenticated handling instead of retrying forever.
    clearTokens();
    return null;
  }

  const data = await res.json();
  updateTokens(data.accessToken, data.refreshToken);
  return data.accessToken as string;
}
