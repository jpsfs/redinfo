/**
 * Keeping the screen on for the length of a run.
 *
 * Not a nicety: an ambulance dashboard mount with a phone that sleeps every
 * thirty seconds means the crew unlocks the phone to read a chief complaint,
 * which is exactly the friction that sends them back to paper.
 *
 * Every path degrades to a no-op. The API is Chromium-only, needs a secure
 * context, and is refused outright in some managed-device configurations — and a
 * refused wake lock must never stop a run.
 */

interface WakeLockSentinelLike {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: 'release', listener: () => void) => void;
}

interface WakeLockLike {
  request: (type: 'screen') => Promise<WakeLockSentinelLike>;
}

function api(): WakeLockLike | null {
  const navigatorWithLock = navigator as Navigator & { wakeLock?: WakeLockLike };
  return navigatorWithLock.wakeLock ?? null;
}

export function isWakeLockAvailable(): boolean {
  return api() !== null;
}

export interface WakeLockHandle {
  release: () => Promise<void>;
}

/**
 * Holds the screen awake, or resolves to null.
 *
 * Null rather than a rejected promise: "the screen may dim" is not an error the
 * caller can do anything about, and a rejection every caller has to swallow is a
 * rejection somebody will forget to swallow.
 */
export async function requestWakeLock(
  onRelease?: () => void,
): Promise<WakeLockHandle | null> {
  const wakeLock = api();
  if (!wakeLock) return null;

  try {
    const sentinel = await wakeLock.request('screen');
    // The OS releases it whenever the tab is hidden — a phone call, a switch to
    // Maps. The listener is how the hook knows to ask again on the way back.
    sentinel.addEventListener('release', () => onRelease?.());
    return {
      release: async () => {
        try {
          if (!sentinel.released) await sentinel.release();
        } catch {
          // Already gone. Nothing to do and nothing worth telling anyone.
        }
      },
    };
  } catch {
    return null;
  }
}
