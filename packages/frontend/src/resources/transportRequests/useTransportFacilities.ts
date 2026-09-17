import { useEffect, useState } from 'react';
import { FacilityWithDistance } from '@redinfo/shared';
import { apiFetch } from '../../api';

/**
 * Facility options for the treatment plan / transport leg pickers (#230) —
 * the same `/facilities/transport` route `DestinationFacilityField` reads,
 * ungated unlike the managed `/facilities` list a `TRANSPORT_COORDINATOR`
 * does not hold `MANAGE_HOSPITALS` for.
 */
export function useTransportFacilities(): FacilityWithDistance[] | null {
  const [options, setOptions] = useState<FacilityWithDistance[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<FacilityWithDistance[]>('/facilities/transport')
      .then((found) => {
        if (!cancelled) setOptions(found);
      })
      .catch(() => {
        if (!cancelled) setOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return options;
}
