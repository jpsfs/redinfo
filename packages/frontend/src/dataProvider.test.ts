import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UpdateParams } from 'react-admin';
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

// ── update() sends only what changed ────────────────────────────────────────
//
// react-admin seeds an Edit form's defaultValues from the whole fetched
// record and submits all of them — including server-computed fields no DTO
// declares (createdAt, certifications, …). The backend's ValidationPipe 400s
// on any of those, so this is the fix for "changing a role gives a backend
// error" (and every other Edit screen's save): diff against previousData and
// send only the real change.

describe('dataProvider.update — diffs against previousData', () => {
  it('sends only the fields that actually changed', async () => {
    setTokens('access-1', 'refresh-1', true);
    let sentBody: unknown;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      sentBody = init?.body ? JSON.parse(init.body as string) : undefined;
      return Promise.resolve(jsonResponse({ id: 'u-1', role: 'EMERGENCY_COORDINATOR' }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const previousData = {
      id: 'u-1',
      firstName: 'Ana',
      role: 'EMERGENCY_OPERATIONAL',
      createdAt: '2026-01-01T00:00:00.000Z',
      certifications: [{ type: 'DRIVER' }],
      locality: { id: 'loc-1', name: 'Barcelos' },
    };

    await dataProvider.update('users', {
      id: 'u-1',
      previousData,
      data: { ...previousData, role: 'EMERGENCY_COORDINATOR' },
    });

    expect(sentBody).toEqual({ role: 'EMERGENCY_COORDINATOR' });
  });

  it('makes no request at all when nothing changed', async () => {
    setTokens('access-1', 'refresh-1', true);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const record = { id: 'u-1', firstName: 'Ana' };
    const result = await dataProvider.update('users', {
      id: 'u-1',
      previousData: record,
      data: { ...record },
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.data).toEqual(record);
  });

  it('sends the whole payload when there is no previousData to diff against', async () => {
    setTokens('access-1', 'refresh-1', true);
    let sentBody: unknown;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      sentBody = init?.body ? JSON.parse(init.body as string) : undefined;
      return Promise.resolve(jsonResponse({ id: 'u-1' }));
    });
    vi.stubGlobal('fetch', fetchMock);

    // No `previousData` — deliberately, to exercise dataProvider.update's
    // documented "hand-built UpdateParams" fallback (see changedFields'
    // doc comment in dataProvider.ts). react-admin's own type declares it
    // required, so this literal needs the same cast a real hand-built
    // caller would.
    await dataProvider.update('users', {
      id: 'u-1',
      data: { id: 'u-1', firstName: 'Ana' },
    } as unknown as UpdateParams);

    expect(sentBody).toEqual({ firstName: 'Ana' });
  });
});
