import { canonicalDisplayName, materialCatalogueKey, medianRoundedUp } from './material-name';

describe('materialCatalogueKey', () => {
  it('folds case, accents and punctuation so near-duplicate spellings collide', () => {
    expect(materialCatalogueKey('Luvas M')).toBe(materialCatalogueKey('luvas  m'));
    expect(materialCatalogueKey('Compressas Esterilizadas')).toBe(
      materialCatalogueKey('compressas esterilizadas'),
    );
  });

  it('does not collide genuinely different names', () => {
    expect(materialCatalogueKey('Luvas M')).not.toBe(materialCatalogueKey('Luvas L'));
  });
});

describe('canonicalDisplayName', () => {
  it('picks the most frequent raw spelling', () => {
    const names = ['Luvas M', 'luvas m', 'Luvas M', 'Luvas M'];
    expect(canonicalDisplayName(names)).toBe('Luvas M');
  });

  it('breaks a frequency tie alphabetically', () => {
    expect(canonicalDisplayName(['Zeta', 'Alfa'])).toBe('Alfa');
  });

  it('is deterministic regardless of input order', () => {
    const a = ['Luvas M', 'luvas m', 'Luvas M'];
    const b = ['luvas m', 'Luvas M', 'Luvas M'];
    expect(canonicalDisplayName(a)).toBe(canonicalDisplayName(b));
  });

  it('is empty for an empty input, never throws', () => {
    expect(canonicalDisplayName([])).toBe('');
  });
});

describe('medianRoundedUp', () => {
  it('rounds a fractional median up, not to the nearest', () => {
    expect(medianRoundedUp([1, 2])).toBe(2); // median 1.5
  });

  it('takes the middle value for an odd-length list', () => {
    expect(medianRoundedUp([5, 1, 3])).toBe(3);
  });

  it('ignores nulls when computing the median', () => {
    expect(medianRoundedUp([null, 4, null, 6])).toBe(5);
  });

  it('is null when every value is null — unknown, not zero', () => {
    expect(medianRoundedUp([null, null])).toBeNull();
    expect(medianRoundedUp([])).toBeNull();
  });
});
