import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dataProvider } from './dataProvider';
import { setTokens, getAccessToken } from './authStorage';

// ── Silent access-token expiry, via the data provider ──────────────────────
//
// Same gap as `authRefresh.test.ts` covers directly, exercised here through
// a real `dataProvider.getList` call: a 401 on a CRUD request must trigger
// one silent refresh-and-retry rather than surfacing as "logged out" while
// the refresh token underneath is still good. See `authRefresh`'s doc
// comment.

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('dataProvider — refresh-and-retry on 401', () => {
  it('retries the request with a refreshed token and succeeds', async () => {
    setTokens('stale-access', 'refresh-1', true);

    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/auth/refresh')) {
        return Promise.resolve(
          jsonResponse({ accessToken: 'fresh-access', refreshToken: 'fresh-refresh' }),
        );
      }
      if (url.includes('/vehicles')) {
        const token = getAccessToken();
        if (token !== 'fresh-access') return Promise.resolve(jsonResponse({ message: 'Unauthorized' }, 401));
        return Promise.resolve(jsonResponse({ data: [{ id: 'v-1' }], total: 1 }));
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await dataProvider.getList('vehicles', {
      pagination: { page: 1, perPage: 25 },
      sort: { field: 'id', order: 'ASC' },
      filter: {},
    });

    expect(result.total).toBe(1);
    expect(result.data).toEqual([{ id: 'v-1' }]);
    expect(getAccessToken()).toBe('fresh-access');
  });

  it('surfaces the original error when there is no refresh token to fall back on', async () => {
    // No setTokens() call — nothing stored, so refreshAccessToken() has
    // nothing to exchange.
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ message: 'Unauthorized' }, 401)));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      dataProvider.getList('vehicles', {
        pagination: { page: 1, perPage: 25 },
        sort: { field: 'id', order: 'ASC' },
        filter: {},
      }),
    ).rejects.toThrow();

    // One attempt for the resource, no refresh call fired.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
