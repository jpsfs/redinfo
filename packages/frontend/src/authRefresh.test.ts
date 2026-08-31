import { describe, expect, it, vi, beforeEach } from 'vitest';
import { refreshAccessToken } from './authRefresh';
import { setTokens, getAccessToken, getRefreshToken } from './authStorage';

// ── Silent access-token expiry ──────────────────────────────────────────────
//
// The 15-minute access token isn't polled for expiry while someone stays on
// one screen — `refreshAccessToken` is what `apiFetch`/`dataProvider`'s
// `httpClient`/etc. call on a 401 before giving up, so a still-valid refresh
// token actually gets used instead of the person being silently logged out.

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('refreshAccessToken', () => {
  it('returns null and does nothing when there is no refresh token to use', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');

    const result = await refreshAccessToken();

    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('exchanges the refresh token and rewrites both tokens in place', async () => {
    setTokens('stale-access', 'refresh-1', true);
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ accessToken: 'fresh-access', refreshToken: 'fresh-refresh' }), {
        status: 200,
      }),
    );

    const result = await refreshAccessToken();

    expect(result).toBe('fresh-access');
    expect(getAccessToken()).toBe('fresh-access');
    expect(getRefreshToken()).toBe('fresh-refresh');
  });

  it('clears the session and returns null when the refresh token is rejected', async () => {
    setTokens('stale-access', 'expired-refresh', true);
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 401 }));

    const result = await refreshAccessToken();

    expect(result).toBeNull();
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });

  it('de-duplicates concurrent callers into a single network round-trip', async () => {
    setTokens('stale-access', 'refresh-1', true);
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ accessToken: 'fresh-access', refreshToken: 'fresh-refresh' }), {
        status: 200,
      }),
    );

    const [first, second] = await Promise.all([refreshAccessToken(), refreshAccessToken()]);

    expect(first).toBe('fresh-access');
    expect(second).toBe('fresh-access');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
