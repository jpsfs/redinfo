import { useCallback, useEffect, useState } from 'react';
import {
  VolunteerHoursFlagFilter,
  VolunteerHoursReviewResponse,
  VolunteerHoursSource,
  VolunteerHoursStatus,
} from '@redinfo/shared';
import { apiFetch } from '../../api';

export interface ReviewQueueFilters {
  flag?: VolunteerHoursFlagFilter;
  source?: VolunteerHoursSource;
  search: string;
  from?: string;
  to?: string;
  sort: 'date' | 'person' | 'minutes';
  order: 'asc' | 'desc';
}

export interface ReviewQueueQuery extends ReviewQueueFilters {
  page: number;
  perPage: number;
}

const DEFAULT_FILTERS: ReviewQueueFilters = {
  search: '',
  sort: 'date',
  order: 'asc',
};

/** Debounce delay for the person/description search field. */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Fetch + query-state for `GET /volunteer-hours/review`, shared by the
 * Pending and Approved tabs (each mounts its own instance, fixed to its own
 * `status`, so switching tabs starts with a clean filter set rather than
 * carrying one tab's filters into the other).
 */
export function useReviewQueue(status: VolunteerHoursStatus, initial: Partial<ReviewQueueQuery> = {}) {
  const [query, setQuery] = useState<ReviewQueueQuery>({
    ...DEFAULT_FILTERS,
    page: 1,
    perPage: 25,
    ...initial,
  });
  // The search box is debounced at the fetch boundary, not the input itself,
  // so the field stays snappy while the request doesn't fire per keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState(query.search);
  const [data, setData] = useState<VolunteerHoursReviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(query.search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query.search]);

  const { page, perPage, flag, source, from, to, sort, order } = query;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ status, page: String(page), perPage: String(perPage), sort, order });
      if (flag) params.set('flag', flag);
      if (source) params.set('source', source);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
      setData(await apiFetch<VolunteerHoursReviewResponse>(`/volunteer-hours/review?${params.toString()}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'error');
    } finally {
      setLoading(false);
    }
  }, [status, page, perPage, flag, source, from, to, sort, order, debouncedSearch]);

  useEffect(() => {
    void load();
  }, [load]);

  // Selection is page-scoped: any change to what the page shows — a filter,
  // a page turn — clears it, so a bulk action never silently reaches past
  // what's on screen.
  useEffect(() => {
    setSelected(new Set());
  }, [page, perPage, flag, source, from, to, sort, order, debouncedSearch]);

  const setFilters = useCallback((patch: Partial<ReviewQueueFilters>) => {
    setQuery((prev) => ({ ...prev, ...patch, page: 1 }));
  }, []);

  const setPage = useCallback((next: number) => {
    setQuery((prev) => ({ ...prev, page: next }));
  }, []);

  const setPerPage = useCallback((next: number) => {
    setQuery((prev) => ({ ...prev, perPage: next, page: 1 }));
  }, []);

  const clearFilters = useCallback(() => {
    setQuery((prev) => ({ ...DEFAULT_FILTERS, page: 1, perPage: prev.perPage }));
  }, []);

  return {
    query,
    data,
    loading,
    error,
    selected,
    setSelected,
    setFilters,
    setPage,
    setPerPage,
    clearFilters,
    refetch: load,
  };
}
