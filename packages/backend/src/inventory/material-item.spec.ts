import { materialItemDisplayName } from '@redinfo/shared';

// ── Locale fallback for MaterialItem display names (#201) ─────────────────────
//
// This is the only place locale fallback for a material's name is decided —
// pinned down here so the catalogue admin screen, the picker and the report
// editor can't disagree about what name to show.

describe('materialItemDisplayName', () => {
  it('returns nameEn for locale en when it is set', () => {
    expect(materialItemDisplayName({ namePt: 'Luvas', nameEn: 'Gloves' }, 'en')).toBe('Gloves');
  });

  it('falls back to namePt for locale en when nameEn is null', () => {
    expect(materialItemDisplayName({ namePt: 'Luvas', nameEn: null }, 'en')).toBe('Luvas');
  });

  it('falls back to namePt for locale en when nameEn is undefined', () => {
    expect(materialItemDisplayName({ namePt: 'Luvas', nameEn: undefined }, 'en')).toBe('Luvas');
  });

  it('returns namePt for locale pt regardless of nameEn', () => {
    expect(materialItemDisplayName({ namePt: 'Luvas', nameEn: 'Gloves' }, 'pt')).toBe('Luvas');
  });
});
