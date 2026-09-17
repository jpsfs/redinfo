import { normalisePlate } from './plate';

describe('normalisePlate', () => {
  it('inserts dashes into a compact plate and uppercases it', () => {
    expect(normalisePlate('12ab34')).toEqual({ value: '12-AB-34', conforms: true });
  });

  it('leaves an already-dashed plate normalised the same way', () => {
    expect(normalisePlate('aa-12-34')).toEqual({ value: 'AA-12-34', conforms: true });
  });

  it.each([
    ['AA-99-99', 'pre-1992'],
    ['99-99-AA', '1992-2005'],
    ['99-AA-99', '2005-2020'],
    ['AA-99-AA', '2020+'],
  ])('accepts the %s era (%s)', (plate) => {
    const result = normalisePlate(plate);
    expect(result.conforms).toBe(true);
    expect(result.value).toBe(plate);
  });

  it('a non-conforming plate is still returned, flagged, never dropped', () => {
    // 6 characters (so dashes are still inserted), but no era pattern matches
    // three letters followed by three digits.
    const result = normalisePlate('AAA111');
    expect(result.conforms).toBe(false);
    expect(result.value).toBe('AA-A1-11');
  });

  it('a plate of unusual length is returned uppercased with no dashes guessed in', () => {
    const result = normalisePlate('ABC-1234');
    expect(result.conforms).toBe(false);
    expect(result.value).toBe('ABC1234');
  });
});
