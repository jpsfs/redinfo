import { useEffect, useState } from 'react';

/**
 * Whether the device thinks it has a network.
 *
 * `navigator.onLine` is famously optimistic — it says true for a phone attached
 * to a wifi access point with no route to anywhere — so it is used for what it
 * is actually good at: the `offline`/`online` *transitions*, which are what tell
 * the sync loop to try again the moment the ambulance crests a hill.
 *
 * Nothing in live mode ever *blocks* on this. The device is the source of truth
 * and every write lands locally first; this only decides which words the sync
 * chip shows and when the queue is nudged.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine !== false);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return online;
}
