import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { detectLocale, initialLocale, messages } from './i18nProvider';

// ── Browser-language detection ────────────────────────────────────────────────
//
// A primary-subtag match, Portuguese whenever nothing recognisable is on
// offer — see #180's decision log for why the fallback is Portuguese rather
// than English (this is a Portuguese Red Cross delegation's app).

describe('detectLocale', () => {
  it.each([
    [['pt-PT', 'en'], 'pt'],
    [['pt-BR'], 'pt'],
    [['en-US'], 'en'],
    [['en-GB', 'pt-PT'], 'en'],
    [['fr-FR'], 'pt'],
    [[], 'pt'],
  ] as const)('detects %j as %s', (languages, expected) => {
    expect(detectLocale(languages)).toBe(expected);
  });
});

describe('initialLocale', () => {
  const KEY = 'RaStore.locale';

  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());

  it('prefers a stored value over browser detection', () => {
    window.localStorage.setItem(KEY, JSON.stringify('en'));
    expect(initialLocale()).toBe('en');
  });

  it('falls back to detection when nothing is stored', () => {
    expect(window.localStorage.getItem(KEY)).toBeNull();
    // jsdom's navigator.languages is not configurable here in a stable way
    // across environments, so this only pins the *fallback path*, not a
    // specific detected language — `detectLocale`'s own table above does that.
    expect(['pt', 'en']).toContain(initialLocale());
  });

  it('ignores a stored value that is not one of our two locales', () => {
    window.localStorage.setItem(KEY, JSON.stringify('fr'));
    expect(['pt', 'en']).toContain(initialLocale());
  });
});

describe('messages', () => {
  it("merges the hand-written Portuguese catalogue over react-admin's English for 'pt'", () => {
    const pt = messages('pt');
    expect(pt.ra.action.save).toBe('Guardar');
    // The app's own catalogue lands at the top level, not nested under `ra`.
    expect(pt['profile.save']).toBe('Guardar');
  });

  it("leaves react-admin's own strings in English for 'en'", () => {
    const en = messages('en');
    expect(en.ra.action.save).toBe('Save');
    expect(en['profile.save']).toBe('Save');
  });
});
