import { InventoryItemType, MaterialItem } from '@redinfo/shared';

/**
 * One selected line in the picker: a material item plus how much of it.
 *
 * Deliberately not `EventReportMaterialInput`/`LiveRunMaterialEntry` — those
 * are what a caller *submits* (they carry a `vehicleId`, or are one-entry-
 * per-tap), this is what the picker *shows*. Carrying the full `MaterialItem`
 * rather than just an id is what lets the component render a line's name and
 * unit without asking the caller for a lookup — see the "no data fetching
 * decisions leak to callers" rule in #207.
 *
 * `quantity` is `null` for an `UNLIMITED` item: it is a toggle (logged or
 * not), never a count.
 */
export interface MaterialLine {
  materialItem: MaterialItem;
  quantity: number | null;
}

export function findLine(lines: MaterialLine[], materialItemId: string): MaterialLine | undefined {
  return lines.find((line) => line.materialItem.id === materialItemId);
}

/**
 * A tap on a favourite tile, a search result, or a successful barcode scan —
 * the one gesture all three of the picker's entry points reduce to.
 *
 * `COUNTABLE`: +1, adding a new line at 1 if this is the item's first tap.
 * `UNLIMITED`: a toggle — tapping a selected one removes it, since there is
 * no count to add to.
 */
export function tapMaterialItem(lines: MaterialLine[], item: MaterialItem): MaterialLine[] {
  const index = lines.findIndex((line) => line.materialItem.id === item.id);

  if (item.type === InventoryItemType.UNLIMITED) {
    if (index >= 0) return lines.filter((_, i) => i !== index);
    return [...lines, { materialItem: item, quantity: null }];
  }

  if (index >= 0) {
    const next = [...lines];
    next[index] = { ...next[index], quantity: (next[index].quantity ?? 0) + 1 };
    return next;
  }
  return [...lines, { materialItem: item, quantity: 1 }];
}

/** The lines-list stepper (or a tile's long-press adjuster) setting an exact count. Floors at 1 — use `removeLine` to drop it to zero. */
export function setLineQuantity(lines: MaterialLine[], materialItemId: string, quantity: number): MaterialLine[] {
  const clamped = Math.max(1, Math.round(quantity));
  return lines.map((line) => (line.materialItem.id === materialItemId ? { ...line, quantity: clamped } : line));
}

export function removeLine(lines: MaterialLine[], materialItemId: string): MaterialLine[] {
  return lines.filter((line) => line.materialItem.id !== materialItemId);
}
