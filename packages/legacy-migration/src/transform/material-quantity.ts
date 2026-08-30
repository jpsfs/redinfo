/**
 * `material_saida.quantidade` (plan finding: discovered against the real
 * dump, not documented anywhere in the legacy schema) is a signed *stock
 * delta*, not a positive "units used" count: a withdrawal decrements a
 * vehicle's stock, so the column is recorded as zero or negative — of 7,238
 * rows in the dump, 5,168 (~71%) are exactly `0` and the rest run from `-1`
 * to `-10`; not one is positive.
 *
 * The event-report loader used to pass this straight through as
 * `EventReportMaterial.quantity`, which `validateEventReport` (correctly)
 * rejects as soon as it sees a non-positive quantity — rejecting the
 * *entire* report over one bad material line. This is what "units used"
 * actually means:
 * - negative → the magnitude is the real count (`-3` used → `3`).
 * - `0` → the item was checked off as used but no count was ever recorded.
 *   Decision (confirmed with the delegation): import it as `1` rather than
 *   drop the line or keep rejecting the report — "used, exact count
 *   unknown" is closer to the truth than either "not used" or "still
 *   missing data".
 */
export function quantityFromLegacyDelta(quantidade: number): number {
  if (quantidade === 0) return 1;
  return Math.abs(quantidade);
}
