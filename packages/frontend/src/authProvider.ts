import { AuthProvider } from 'react-admin';

const API_URL = import.meta.env.VITE_API_URL ?? '';

const TOKEN_KEY = 'redinfo_access_token';
const REFRESH_KEY = 'redinfo_refresh_token';

export const authProvider: AuthProvider = {
  // ── Login (local) ────────────────────────────────────────────────────────────
  async login({ username, password }: { username: string; password: string }) {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: username, password }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message ?? 'Invalid credentials');
    }

    const data = await res.json();
    localStorage.setItem(TOKEN_KEY, data.accessToken);
    localStorage.setItem(REFRESH_KEY, data.refreshToken);
  },

  // ── Logout ───────────────────────────────────────────────────────────────────
  async logout() {
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    if (refreshToken) {
      await fetch(`${API_URL}/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      }).catch(() => undefined);
    }
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },

  // ── Token refresh ─────────────────────────────────────────────────────────────
  async checkAuth() {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) throw new Error('No token');

    // Check if JWT is expired (client-side fast path)
    try {
      const [, payload] = token.split('.');
      const decoded = JSON.parse(atob(payload));
      if (decoded.exp * 1000 < Date.now()) {
        // Attempt refresh
        const refreshToken = localStorage.getItem(REFRESH_KEY);
        if (!refreshToken) throw new Error('No refresh token');

        const res = await fetch(`${API_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });

        if (!res.ok) throw new Error('Refresh failed');

        const data = await res.json();
        localStorage.setItem(TOKEN_KEY, data.accessToken);
        localStorage.setItem(REFRESH_KEY, data.refreshToken);
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
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) throw new Error('No token');

    const res = await fetch(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to fetch identity');

    const user = await res.json();
    return {
      id: user.id,
      fullName: `${user.firstName} ${user.lastName}`,
      avatar: undefined,
      ...user,
    };
  },

  // ── Permissions ───────────────────────────────────────────────────────────────
  async getPermissions() {
    const token = localStorage.getItem(TOKEN_KEY);
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

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
