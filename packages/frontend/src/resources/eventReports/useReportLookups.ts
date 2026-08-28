import { useEffect, useRef, useState } from 'react';
import {
  CrewSuggestionResponse,
  EventReportInput,
  EventReportType,
  HospitalWithDistance,
  Locality,
  MaterialItem,
  SchedulePerson,
  Vehicle,
} from '@redinfo/shared';
import { apiFetch } from '../../api';

export interface ReportLookups {
  /** Everyone who may appear on a crew. */
  candidates: SchedulePerson[];
  vehicles: Vehicle[];
  /** Every active hospital, keyed by id, for showing a name next to a victim. */
  hospitalsById: Record<string, HospitalWithDistance>;
  /** The report's locality, resolved for display. */
  locality: Locality | null;
  /** The shift to pre-fill from, and the recent ones to switch to. */
  crewSuggestion: CrewSuggestionResponse | null;
  /**
   * The full catalogue entry behind each material line already on the draft,
   * keyed by id. `MaterialPicker` resolves the items it shows you (favourites,
   * search, a scan) on its own — this is only for a line the picker never
   * fetched itself: one loaded from a filed report, or from a resumed draft.
   */
  materialItemsById: Record<string, MaterialItem>;
  loading: boolean;
}

const EMPTY: ReportLookups = {
  candidates: [],
  vehicles: [],
  hospitalsById: {},
  locality: null,
  crewSuggestion: null,
  materialItemsById: {},
  loading: true,
};

/**
 * Everything the form needs to show a name where the draft holds an id.
 *
 * Loaded once here rather than by each section, for two reasons: a phone on a
 * bad connection should make four requests, not fourteen; and a section that
 * fetches its own data cannot be rendered in a test without a server.
 *
 * A failed lookup is not an error state. The draft still holds the ids, the
 * report can still be filed, and a missing display name is a cosmetic loss —
 * so every fetch here degrades to an empty list rather than blocking the form.
 */
export function useReportLookups(
  draft: Pick<EventReportInput, 'localityId' | 'type' | 'startedAt' | 'materials'>,
): ReportLookups {
  const [lookups, setLookups] = useState<ReportLookups>(EMPTY);

  // Loaded once: the roster, the fleet and the hospital list do not change
  // while a crew fills a report in.
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const [candidates, vehicles, hospitals] = await Promise.all([
        apiFetch<SchedulePerson[]>('/event-reports/crew-candidates').catch(() => []),
        apiFetch<{ data: Vehicle[] }>('/vehicles?perPage=200')
          .then((result) => result.data)
          .catch(() => []),
        apiFetch<HospitalWithDistance[]>('/hospitals/picker').catch(() => []),
      ]);

      if (cancelled) return;
      setLookups((current) => ({
        ...current,
        candidates,
        vehicles,
        hospitalsById: Object.fromEntries(
          hospitals.map((hospital) => [hospital.id, hospital]),
        ),
        loading: false,
      }));
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-resolved whenever the locality changes, so the field can show
  // "Taveiro · Coimbra · Coimbra" from an id alone — including on a report
  // loaded for editing.
  useEffect(() => {
    if (!draft.localityId) {
      setLookups((current) => ({ ...current, locality: null }));
      return undefined;
    }
    let cancelled = false;

    apiFetch<Locality>(`/localities/${draft.localityId}`)
      .then((locality) => {
        if (!cancelled) setLookups((current) => ({ ...current, locality }));
      })
      .catch(() => {
        if (!cancelled) setLookups((current) => ({ ...current, locality: null }));
      });

    return () => {
      cancelled = true;
    };
  }, [draft.localityId]);

  // The rota depends on the kind of activity and when it started, so this one
  // reloads when either moves.
  useEffect(() => {
    let cancelled = false;
    const at = draft.startedAt ? `&at=${encodeURIComponent(draft.startedAt)}` : '';

    apiFetch<CrewSuggestionResponse>(
      `/event-reports/crew-suggestion?type=${draft.type as EventReportType}${at}`,
    )
      .then((crewSuggestion) => {
        if (!cancelled) setLookups((current) => ({ ...current, crewSuggestion }));
      })
      .catch(() => {
        // No rota, no permission, or no network: the crew is picked by hand,
        // which is an ordinary case rather than a failure.
        if (!cancelled) setLookups((current) => ({ ...current, crewSuggestion: null }));
      });

    return () => {
      cancelled = true;
    };
  }, [draft.type, draft.startedAt]);

  // Resolved one id at a time rather than in bulk — there is no "several ids"
  // endpoint on the catalogue, only `GET /material-items/:id` — and only for
  // ids not already resolved, since a quantity edit rebuilds `draft.materials`
  // on every keystroke and must not refetch the same item each time.
  const resolvedMaterialIds = useRef(new Set<string>());
  useEffect(() => {
    const ids = [...new Set((draft.materials ?? []).map((material) => material.materialItemId))];
    const missing = ids.filter((id) => !resolvedMaterialIds.current.has(id));
    if (missing.length === 0) return undefined;
    missing.forEach((id) => resolvedMaterialIds.current.add(id));

    let cancelled = false;
    Promise.all(
      missing.map((id) => apiFetch<MaterialItem>(`/material-items/${id}`).catch(() => null)),
    ).then((items) => {
      if (cancelled) return;
      const resolved = Object.fromEntries(
        items.filter((item): item is MaterialItem => item !== null).map((item) => [item.id, item]),
      );
      if (Object.keys(resolved).length === 0) return;
      setLookups((current) => ({
        ...current,
        materialItemsById: { ...current.materialItemsById, ...resolved },
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [draft.materials]);

  return lookups;
}

/** `Tiago Lourenço`, from an id. Falls back to nothing rather than to an id. */
export function personName(
  lookups: Pick<ReportLookups, 'candidates'>,
  userId: string,
): string {
  const person = lookups.candidates.find((candidate) => candidate.id === userId);
  return person ? `${person.firstName} ${person.lastName}` : '';
}

/** `AA-12-BC · Amb. 04`, from an id. */
export function vehicleLabel(
  lookups: Pick<ReportLookups, 'vehicles'>,
  vehicleId: string,
): string {
  const vehicle = lookups.vehicles.find((entry) => entry.id === vehicleId);
  return vehicle ? `${vehicle.licensePlate} · ${vehicle.numeroCauda}` : '';
}
