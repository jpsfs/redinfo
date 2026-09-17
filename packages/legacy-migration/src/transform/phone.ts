/**
 * Legacy stores phone numbers as `int` columns (`socorrista.contacto`,
 * `.contacto2`, `saidas.contacto`). `0` is the column's "not given" value —
 * `NO_AUTO_VALUE_ON_ZERO` is set in the dump, so it was written deliberately,
 * never an autoincrement accident — and is indistinguishable from "unset"
 * once it reaches this function.
 *
 * One thing this function cannot do: recover a leading `0` a number may once
 * have had. MySQL's `int` storage drops it before this code ever sees the
 * value — a pre-2000 landline typed as "022123456" is already `22123456` in
 * the dump. Padding it back on would be fabricating a digit, not restoring
 * one, so the output is always exactly the decimal digits of the stored
 * integer.
 */
export function phoneFromLegacyInt(value: number | null | undefined): string | null {
  if (value === null || value === undefined || value === 0) return null;
  return String(value);
}
