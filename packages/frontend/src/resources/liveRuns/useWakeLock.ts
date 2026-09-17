import { useEffect, useRef, useState } from 'react';
import { WakeLockHandle, isWakeLockAvailable, requestWakeLock } from './wakeLock';

/**
 * Holds the screen awake for the length of a run.
 *
 * Re-requested on `visibilitychange → visible`, because the OS releases the lock
 * whenever the tab is hidden — which happens every time the crew hands off to
 * Maps or takes a call, i.e. constantly. Without the re-request the lock is held
 * for the first thirty seconds of a run and never again.
 *
 * Returns whether it is held, for nothing more than an honest caption. A refused
 * wake lock never stops a run: the API is Chromium-only, wants a secure context,
 * and is denied outright on some managed devices.
 */
export function useWakeLock(active: boolean): { held: boolean; available: boolean } {
  const [held, setHeld] = useState(false);
  const lock = useRef<WakeLockHandle | null>(null);

  useEffect(() => {
    let cancelled = false;

    const acquire = async () => {
      if (!active || cancelled || lock.current) return;
      const handle = await requestWakeLock(() => setHeld(false));
      if (cancelled) {
        void handle?.release();
        return;
      }
      lock.current = handle;
      setHeld(handle !== null);
    };

    const release = () => {
      void lock.current?.release();
      lock.current = null;
      setHeld(false);
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        // The sentinel from before the tab was hidden is dead, whether or not
        // its release event fired.
        lock.current = null;
        void acquire();
      }
    };

    if (active) {
      void acquire();
      document.addEventListener('visibilitychange', onVisible);
    } else {
      release();
    }

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      release();
    };
  }, [active]);

  return { held, available: isWakeLockAvailable() };
}
