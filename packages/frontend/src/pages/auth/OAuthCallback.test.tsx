import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { OAuthCallback } from './OAuthCallback';
import { getAccessToken, getRefreshToken, clearTokens } from '../../authStorage';

// The params arrive inside the fragment (`/#/auth/callback?...`), so under the
// HashRouter `<Admin>` mounts they are on the *router's* location and
// `window.location.search` is blank. Reading the wrong one is exactly the bug
// that left Google sign-in stuck on the login screen.

function renderAt(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/auth/callback" element={<OAuthCallback />} />
        <Route path="/" element={<div>home</div>} />
        <Route path="/login" element={<div>login</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  // A bare path/query must never be what the component reads.
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  clearTokens();
  vi.unstubAllGlobals();
});

describe('OAuthCallback', () => {
  it('stores the tokens from the route query and lands on the home page', async () => {
    const { findByText } = renderAt('/auth/callback?accessToken=at&refreshToken=rt&remember=true');

    expect(await findByText('home')).toBeInTheDocument();
    expect(getAccessToken()).toBe('at');
    expect(getRefreshToken()).toBe('rt');
    expect(localStorage.getItem('redinfo_access_token')).toBe('at');
  });

  it('keeps a not-remembered session in sessionStorage only', async () => {
    const { findByText } = renderAt('/auth/callback?accessToken=at&refreshToken=rt&remember=false');

    expect(await findByText('home')).toBeInTheDocument();
    expect(sessionStorage.getItem('redinfo_access_token')).toBe('at');
    expect(localStorage.getItem('redinfo_access_token')).toBeNull();
  });

  it('falls back to the login screen when the tokens are missing', async () => {
    const { findByText } = renderAt('/auth/callback');

    expect(await findByText('login')).toBeInTheDocument();
    await waitFor(() => expect(getAccessToken()).toBeNull());
  });
});
