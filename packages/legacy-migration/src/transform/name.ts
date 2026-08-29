/**
 * Legacy carries one free-text `nome` column; the target needs
 * `firstName`/`lastName`, both NOT NULL. There is no reliable way to tell a
 * compound Portuguese surname from a compound given name from a string alone
 * ("Maria da Conceição Alves Pereira" could be split several defensible
 * ways), so the rule is deliberately the simplest one that is total: the
 * first token is the given name, everything else is the surname. Good
 * enough for a name that is never used to address anyone by — the app shows
 * "firstName lastName" back together everywhere that matters.
 */

/** Collapses runs of whitespace and trims — legacy `nome` values are free text. */
export function normaliseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** Used when legacy holds no name at all — `lastName` is NOT NULL, so this must produce something. */
export const UNKNOWN_NAME_PLACEHOLDER = 'Desconhecido';

export interface SplitName {
  firstName: string;
  lastName: string;
}

export function splitPortugueseName(fullNameRaw: string | null | undefined): SplitName {
  const fullName = normaliseWhitespace(fullNameRaw ?? '');
  if (!fullName) {
    return { firstName: UNKNOWN_NAME_PLACEHOLDER, lastName: UNKNOWN_NAME_PLACEHOLDER };
  }

  const tokens = fullName.split(' ');
  if (tokens.length === 1) {
    // A single-token name (nickname, or a mononym) — the whole thing is both
    // given name and surname rather than inventing a blank half.
    return { firstName: tokens[0], lastName: tokens[0] };
  }

  return { firstName: tokens[0], lastName: tokens.slice(1).join(' ') };
}
