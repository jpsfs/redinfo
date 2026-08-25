import { useLocaleState } from 'react-admin';
import type { Locale } from '@redinfo/shared';

/**
 * What `Intl`/`toLocaleDateString`/`toLocaleString` actually want — a real
 * region tag — mapped from the app's own bare `Locale` (#180 phase 5).
 *
 * The app's locale codes deliberately don't encode a region (see `Locale`'s
 * doc comment in `@redinfo/shared`: content is European Portuguese, and the
 * code doesn't need to say so). `Intl` has no such option — a bare `'pt'`
 * lets the runtime guess a region, which is only reliably `pt-PT` because
 * every runtime this app has been checked against happens to default that
 * way. Spelling the region out here removes the guess.
 */
const INTL_LOCALES: Record<Locale, string> = {
  pt: 'pt-PT',
  en: 'en-GB',
};

export function useIntlLocale(): string {
  const [locale] = useLocaleState();
  return INTL_LOCALES[locale as Locale] ?? INTL_LOCALES.pt;
}
