import polyglotI18nProvider from 'ra-i18n-polyglot';
import englishMessages from 'ra-language-english';
import { localStorageStore, TranslationMessages } from 'react-admin';
import type { Locale } from '@redinfo/shared';
import { messagesFor } from './labels';
import raPortugueseMessages from './ra-pt';

export type { Locale };

/**
 * Shared with `<Admin store={store}>` (see `App.tsx`) so `authProvider` can
 * write the locale `/auth/me` returns and have the whole tree pick it up —
 * see `initialLocale()`'s doc comment for why that matters on cold boot.
 */
export const store = localStorageStore();

/** What the switcher on `MyProfilePage` offers. */
export const AVAILABLE_LOCALES: { locale: Locale; name: string }[] = [
  { locale: 'pt', name: 'Português' },
  { locale: 'en', name: 'English' },
];

/**
 * A primary-subtag match over the browser's requested languages: `pt-PT` and
 * `pt-BR` both match `pt`, `en-US` and `en-GB` both match `en`, anything else
 * (including no match at all) falls back to Portuguese — see #180's decision
 * log for why the fallback is Portuguese rather than English.
 */
export function detectLocale(languages: readonly string[] = navigator.languages ?? []): Locale {
  for (const language of languages) {
    const primary = language.split('-')[0]?.toLowerCase();
    if (primary === 'en') return 'en';
    if (primary === 'pt') return 'pt';
  }
  return 'pt';
}

/** What `useStore('locale')` reads once mounted — see `localStorageStore`'s `RaStore.locale` key. */
function readStoredLocale(): Locale | null {
  try {
    const raw = window.localStorage.getItem('RaStore.locale');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed === 'pt' || parsed === 'en' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * The locale react-admin's `<Admin>` boots into, before any network call.
 *
 * MUST agree with what `useStore('locale')` resolves to once the store has
 * settled, or `I18nContextProvider` renders `null` for a tick on every cold
 * boot while it re-resolves against a different value (see
 * `I18nContextProvider`'s `isInitialized` check in `ra-core`).
 */
export function initialLocale(): Locale {
  return readStoredLocale() ?? detectLocale();
}

/**
 * One locale's full catalogue: react-admin's own strings (English, with the
 * hand-written Portuguese in `ra-pt.ts` merged over it for `pt`) plus this
 * app's own messages. Exported so tests can build an `i18nProvider` pinned
 * to a specific locale without duplicating this assembly.
 *
 * Takes a plain `string` — not `Locale` — because `ra-i18n-polyglot`'s
 * `getMessages` callback is typed that way; `AVAILABLE_LOCALES` is what
 * actually guarantees react-admin only ever calls this with `'pt'`/`'en'`.
 */
export const messages = (locale: string): TranslationMessages => ({
  ra: {
    ...englishMessages.ra,
    ...(locale === 'pt' ? raPortugueseMessages.ra : {}),
  },
  ...messagesFor(locale as Locale),
});

export const i18nProvider = polyglotI18nProvider(messages, initialLocale(), AVAILABLE_LOCALES);
