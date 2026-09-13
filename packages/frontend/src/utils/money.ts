/**
 * EUR, formatted from integer cents — the only currency this app ever shows
 * (the compensation offer, #246 Stage 2). Cents in, not euros, because that
 * is how the API carries every rate/amount (`AvailabilityWindow`/`Schedule`'s
 * `compensation*Cents` fields): never a float, so a coordinator's 5€/hour
 * cannot drift into 4.999999999.
 */
export function formatEuroCents(locale: string, cents: number): string {
  return (cents / 100).toLocaleString(locale, { style: 'currency', currency: 'EUR' });
}
