import { useEffect, useState } from 'react';
import { EventReportType } from '@redinfo/shared';
import { apiFetch } from '../../api';

export interface StatisticsFilterState {
  from: string;
  to: string;
  /** Tabs 2 and 3 only. */
  type?: EventReportType;
}

/** Fetch state for one `/statistics/<endpoint>` tab. */
export function useStatisticsTab<T>(endpoint: 'people' | 'activity' | 'fleet', filters: StatisticsFilterState) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ from: filters.from, to: filters.to });
    if (filters.type) params.set('type', filters.type);
    apiFetch<T>(`/statistics/${endpoint}?${params.toString()}`)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'error');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [endpoint, filters.from, filters.to, filters.type]);

  return { data, loading, error };
}
