import { useCallback, useEffect, useRef, useState } from 'react';
import { MaterialItem } from '@redinfo/shared';
import { apiFetch } from '../../api';
import { useOnline } from '../../hooks/useOnline';
import { listMaterialFavourites, saveMaterialFavourites } from './liveRunDb';

export interface LiveMaterialsCatalogueHandle {
  /** Admin-pinned favourites — the device's own copy, so the grid renders from a dead spot. */
  favourites: MaterialItem[];
  /** True only until the device's own copy has been read. Never true again after that. */
  loading: boolean;
  /**
   * Resolves a scanned code to a catalogue item.
   *
   * Checked against the cached favourites first — the one list guaranteed to
   * be on the device — and only against the network for a code that is not
   * one of them. That order is what makes "a dead spot must not break
   * scanning of a known item" true: a favourite resolves without a request at
   * all, and only a long-tail item ever needs one.
   */
  findByBarcode: (code: string) => Promise<MaterialItem>;
}

/**
 * The live picker's catalogue: the same admin-pinned favourites `MaterialPicker`
 * shows, but read from the device first and refreshed from the network rather
 * than fetched fresh on every mount — the difference #209 exists for.
 *
 * Refreshed on mount and whenever the connection comes back, mirroring
 * `useLiveRunSync`'s own `online` cue. A failed refresh (offline, or a request
 * that simply fails) leaves whatever is already on screen — the favourites
 * grid never goes blank because a fetch failed.
 */
export function useLiveMaterialsCatalogue(): LiveMaterialsCatalogueHandle {
  const online = useOnline();
  const [favourites, setFavourites] = useState<MaterialItem[]>([]);
  const [loading, setLoading] = useState(true);

  // `findByBarcode` is a stable callback (no dependency on render state), so
  // the sheet can call it from a scanner effect without re-subscribing.
  const favouritesRef = useRef<MaterialItem[]>([]);
  favouritesRef.current = favourites;

  useEffect(() => {
    let cancelled = false;
    void listMaterialFavourites().then((cached) => {
      if (cancelled) return;
      if (cached.length) setFavourites(cached);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const response = await apiFetch<{ data: MaterialItem[] }>(
        '/material-items?frequent=true&perPage=200',
      );
      const items = response.data ?? [];
      setFavourites(items);
      setLoading(false);
      void saveMaterialFavourites(items);
    } catch {
      // Offline, or the request otherwise failed — whatever is cached stays.
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!online) return;
    void refresh();
  }, [online, refresh]);

  const findByBarcode = useCallback(async (code: string): Promise<MaterialItem> => {
    const cached = favouritesRef.current.find((item) =>
      item.barcodes?.some((barcode) => barcode.code === code),
    );
    if (cached) return cached;
    return apiFetch<MaterialItem>(`/material-items/by-barcode/${encodeURIComponent(code)}`);
  }, []);

  return { favourites, loading, findByBarcode };
}
