/**
 * `ambulancias.matricula` is free text (`varchar(15)`); `Vehicle.licensePlate`
 * is `@unique` NOT NULL and the app elsewhere validates it against
 * `PT_LICENSE_PLATE_REGEX` (shared) but never *rejects* on creation of a
 * vehicle the delegation already owns. So this transform never drops a row —
 * a plate that does not conform is still imported, uppercased and
 * dash-normalised as best it can be, with `conforms: false` so the report can
 * list it for someone to fix by hand.
 */
import { PT_LICENSE_PLATE_REGEX } from '@redinfo/shared';

export interface PlateResolution {
  value: string;
  conforms: boolean;
}

/**
 * Strips existing separators, uppercases, and — only for the 6-character case
 * every Portuguese plate era shares — re-inserts dashes every two characters.
 * A plate of any other length is returned uppercased with no dashes guessed
 * in, since there would be no principled place to put them.
 */
export function normalisePlate(raw: string): PlateResolution {
  const compact = raw.toUpperCase().replace(/[\s-]+/g, '');
  const value = compact.length === 6 ? `${compact.slice(0, 2)}-${compact.slice(2, 4)}-${compact.slice(4, 6)}` : compact;
  return { value, conforms: PT_LICENSE_PLATE_REGEX.test(value) };
}
