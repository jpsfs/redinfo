import { useEffect, useState } from 'react';
import { getAccessToken } from '../authProvider';
import { refreshAccessToken } from '../authRefresh';

const API_URL = import.meta.env.VITE_API_URL ?? '';

/**
 * Loads `GET /users/:id/photo` as a displayable object URL.
 *
 * The endpoint is deliberately behind the same `JwtAuthGuard` as everything
 * else in the app (see `UsersController.downloadPhoto`'s doc comment: not
 * sensitive the way identity numbers are, but still authenticated) — so a
 * plain `<img src="/users/:id/photo">` cannot carry the bearer token, and this
 * fetches the bytes itself instead, the same trick `apiDownload` uses for
 * saving a file, just kept as an object URL rather than clicked into a save.
 *
 * Revokes the previous URL whenever `userId`/`hasPhoto` changes or the caller
 * unmounts — an object URL otherwise leaks for the life of the tab.
 */
export function useAuthenticatedPhoto(userId: string | undefined, hasPhoto: boolean): string | null {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || !hasPhoto) {
      setSrc(null);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;

    const load = (token: string | null) =>
      fetch(`${API_URL}/users/${userId}/photo`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

    void (async () => {
      try {
        let response = await load(getAccessToken());
        if (response.status === 401) {
          const refreshed = await refreshAccessToken();
          if (refreshed) response = await load(refreshed);
        }
        if (!response.ok) throw new Error(response.statusText);
        const blob = await response.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      } catch {
        if (!cancelled) setSrc(null);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [userId, hasPhoto]);

  return src;
}
