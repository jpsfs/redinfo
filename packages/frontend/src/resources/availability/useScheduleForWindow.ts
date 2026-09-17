import { useEffect, useState } from 'react';
import { Schedule } from '@redinfo/shared';
import { apiFetch } from '../../api';

/**
 * The schedule built from one window, if any — `undefined` while loading (or
 * for a viewer with no schedule permission, which the endpoint 403s), `null`
 * once it is known there isn't one yet. Shared by `ScheduleButton` (which
 * one to open) and the window's own compensation-offer display (Stage 2
 * needs the schedule to resolve the offer as a whole unit alongside the
 * window — `resolveCompensationOffer`).
 */
export function useScheduleForWindow(windowId: string | undefined): Schedule | null | undefined {
  const [schedule, setSchedule] = useState<Schedule | null | undefined>(undefined);

  useEffect(() => {
    if (!windowId) return;
    let cancelled = false;
    apiFetch<{ data: Schedule[] }>(`/schedules?windowId=${encodeURIComponent(windowId)}&perPage=1`)
      .then((result) => {
        if (!cancelled) setSchedule(result.data[0] ?? null);
      })
      .catch(() => {
        // A volunteer reading a window has no schedule permission — the
        // offer still resolves off the window alone, via `undefined` here.
        if (!cancelled) setSchedule(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [windowId]);

  return schedule;
}
