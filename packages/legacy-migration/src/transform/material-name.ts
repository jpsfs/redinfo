/**
 * `Material.Descricao` / `material_saida.material` → one `MaterialItem` per
 * distinct real-world item (plan §4.9).
 *
 * Legacy has no catalogue table — the same physical item is typed slightly
 * differently across 183 `Material` rows and 7,312 `material_saida` lines
 * ("Luvas M", "luvas m", "Luvas  M"). `materialCatalogueKey` is what
 * collapses those into one identity; `canonicalDisplayName` then has to pick
 * *one* spelling to show, deterministically, regardless of which order the
 * loader happens to visit the source rows in — a name that depends on
 * iteration order would make a re-run's diff noisy for no reason.
 */
import { foldForSearch } from '@redinfo/shared';

/** One `MaterialItem` per distinct folded name. */
export function materialCatalogueKey(descricao: string): string {
  return foldForSearch(descricao);
}

/**
 * The most frequent raw spelling wins; ties break alphabetically. Both rules
 * are total orders over the input multiset, so the result never depends on
 * the order `rawNames` was built in.
 */
export function canonicalDisplayName(rawNames: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const raw of rawNames) {
    counts.set(raw, (counts.get(raw) ?? 0) + 1);
  }

  const [best] = [...counts.entries()].sort(
    ([nameA, countA], [nameB, countB]) => countB - countA || nameA.localeCompare(nameB),
  );
  return best?.[0] ?? '';
}

/**
 * `recommendedQuantity` (plan §4.9): the median of `Quantidade_minima` across
 * the vehicles of a type that carry the item, rounded **up** — a stock target
 * that rounds down is a target a crew can silently fall short of and still
 * look compliant. `null` (not `0`) when every vehicle's value was null: an
 * unknown target is not the same fact as "carry none of this".
 */
export function medianRoundedUp(values: readonly (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null).sort((a, b) => a - b);
  if (present.length === 0) return null;

  const mid = Math.floor(present.length / 2);
  const median = present.length % 2 === 1 ? present[mid] : (present[mid - 1] + present[mid]) / 2;
  return Math.ceil(median);
}
