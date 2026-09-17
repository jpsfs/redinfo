import { normaliseAmbulanciaCode } from './ambulancia-code';

describe('normaliseAmbulanciaCode', () => {
  it('strips leading zeros so "007" and 7 compare equal', () => {
    expect(normaliseAmbulanciaCode('007')).toBe(normaliseAmbulanciaCode(7));
  });

  it('an int and its matching string normalise identically', () => {
    expect(normaliseAmbulanciaCode(12)).toBe(normaliseAmbulanciaCode('12'));
    expect(normaliseAmbulanciaCode(12)).toBe('12');
  });

  it('falls back to a trimmed string for a non-numeric value rather than throwing', () => {
    expect(normaliseAmbulanciaCode(' AB ')).toBe('AB');
  });
});
