import { AuthProvider } from 'react-admin';
import type { Locale } from '@redinfo/shared';
import { store } from './i18n/i18nProvider';
import { getAccessToken, getRefreshToken, setTokens, clearTokens } from './authStorage';
import { refreshAccessToken } from './authRefresh';

const API_URL = import.meta.env.VITE_API_URL ?? '';

export const authProvider: AuthProvider = {
  // ── Login (local) ────────────────────────────────────────────────────────────
  async login({
    username,
    password,
    remember = true,
  }: {
    username: string;
    password: string;
    /** "Keep me signed in" — see `authStorage`'s doc comment. */
    remember?: boolean;
  }) {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: username, password, remember }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message ?? 'Invalid credentials');
    }

    const data = await res.json();
    setTokens(data.accessToken, data.refreshToken, remember);
  },

  // ── Logout ───────────────────────────────────────────────────────────────────
  async logout() {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      await fetch(`${API_URL}/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      }).catch(() => undefined);
    }
    clearTokens();
  },

  // ── Token refresh ─────────────────────────────────────────────────────────────
  async checkAuth() {
    const token = getAccessToken();
    if (!token) throw new Error('No token');

    // Check if JWT is expired (client-side fast path)
    try {
      const [, payload] = token.split('.');
      const decoded = JSON.parse(atob(payload));
      if (decoded.exp * 1000 < Date.now()) {
        const refreshed = await refreshAccessToken();
        if (!refreshed) throw new Error('Session expired');
      }
    } catch {
      throw new Error('Session expired');
    }
  },

  // ── Error handling ────────────────────────────────────────────────────────────
  async checkError({ status }: { status: number }) {
    if (status === 401 || status === 403) throw new Error('Unauthorized');
  },

  // ── Identity ──────────────────────────────────────────────────────────────────
  async getIdentity() {
    const token = getAccessToken();
    if (!token) throw new Error('No token');

    const res = await fetch(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to fetch identity');

    const user = await res.json();

    // Reconcile the account's chosen language with what the tree is
    // currently showing — see #180's precedence note. `RaStore.locale`
    // drives the *first* paint, before this call resolves; from here on the
    // server wins. `user.locale === null` means "never chosen" — leave the
    // store (browser-detected) alone, or the person who changes their
    // phone's language would stop being followed by a locale we invented.
    const serverLocale: Locale | null = user.locale ?? null;
    if (serverLocale && serverLocale !== store.getItem<Locale>('locale')) {
      store.setItem('locale', serverLocale);
    }

    return {
      id: user.id,
      fullName: `${user.firstName} ${user.lastName}`,
      avatar: undefined,
      ...user,
    };
  },

  // ── Permissions ───────────────────────────────────────────────────────────────
  async getPermissions() {
    const token = getAccessToken();
    if (!token) return null;
    try {
      const [, payload] = token.split('.');
      const decoded = JSON.parse(atob(payload));
      return decoded.role ?? null;
    } catch {
      return null;
    }
  },
};

export { getAccessToken };
