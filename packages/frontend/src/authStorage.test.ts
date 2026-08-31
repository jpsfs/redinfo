import { describe, expect, it, beforeEach } from 'vitest';
import { setTokens, updateTokens, getAccessToken, getRefreshToken, clearTokens } from './authStorage';

// ── "Keep me signed in" — which Web Storage area a session lives in ───────
//
// See the module doc comment: `remember: true` → localStorage (survives
// closing the browser), `remember: false` → sessionStorage (gone with the
// tab). These pin down the storage split and the fact that starting a new
// session always clears whatever the *other* area was holding, so a second
// login with a different `remember` choice can't leave a stale, readable
// token behind in the area it stopped using.

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('setTokens', () => {
  it('remembered sessions go to localStorage, not sessionStorage', () => {
    setTokens('access-1', 'refresh-1', true);

    expect(localStorage.getItem('redinfo_access_token')).toBe('access-1');
    expect(localStorage.getItem('redinfo_refresh_token')).toBe('refresh-1');
    expect(sessionStorage.getItem('redinfo_access_token')).toBeNull();
  });

  it('un-remembered sessions go to sessionStorage, not localStorage', () => {
    setTokens('access-1', 'refresh-1', false);

    expect(sessionStorage.getItem('redinfo_access_token')).toBe('access-1');
    expect(sessionStorage.getItem('redinfo_refresh_token')).toBe('refresh-1');
    expect(localStorage.getItem('redinfo_access_token')).toBeNull();
  });

  it('a new login clears whatever the previous choice left in the other storage', () => {
    setTokens('access-1', 'refresh-1', true); // remembered
    setTokens('access-2', 'refresh-2', false); // now not remembered

    expect(localStorage.getItem('redinfo_access_token')).toBeNull();
    expect(sessionStorage.getItem('redinfo_access_token')).toBe('access-2');
  });
});

describe('getAccessToken / getRefreshToken', () => {
  it('reads whichever storage currently holds a session', () => {
    setTokens('access-1', 'refresh-1', false);

    expect(getAccessToken()).toBe('access-1');
    expect(getRefreshToken()).toBe('refresh-1');
  });

  it('returns null with no session in either storage', () => {
    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });
});

describe('updateTokens', () => {
  it('rewrites a remembered session in place, in localStorage', () => {
    setTokens('access-1', 'refresh-1', true);

    updateTokens('access-2', 'refresh-2');

    expect(localStorage.getItem('redinfo_access_token')).toBe('access-2');
    expect(localStorage.getItem('redinfo_refresh_token')).toBe('refresh-2');
    expect(sessionStorage.getItem('redinfo_access_token')).toBeNull();
  });

  it('rewrites a non-remembered session in place, in sessionStorage', () => {
    setTokens('access-1', 'refresh-1', false);

    updateTokens('access-2', 'refresh-2');

    expect(sessionStorage.getItem('redinfo_access_token')).toBe('access-2');
    expect(localStorage.getItem('redinfo_access_token')).toBeNull();
  });
});

describe('clearTokens', () => {
  it('removes the session from both storages regardless of which held it', () => {
    setTokens('access-1', 'refresh-1', true);

    clearTokens();

    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });
});
