/**
 * `saidas.ambulancia` and `Material.Ambulancia` are `int(3)`; `ambulancias
 * .n_regional` (the column both actually reference) is `varchar(20)` — plan
 * finding F6. Not a clean FK: `"007"` and `7` must compare equal, and a
 * value that isn't a plain integer at all (unlikely, but `n_regional` is
 * free-typed) must not crash the comparison. This is the one normalisation
 * both `preflight.ts`'s join-shape assertion and every loader that joins
 * through `ambulancia`/`Ambulancia` use — never compare the two forms by hand
 * at a call site.
 */
export function normaliseAmbulanciaCode(code: number | string): string {
  const asInteger = Number.parseInt(String(code), 10);
  return Number.isNaN(asInteger) ? String(code).trim() : String(asInteger);
}
