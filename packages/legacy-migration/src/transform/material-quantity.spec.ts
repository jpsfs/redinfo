import { quantityFromLegacyDelta } from './material-quantity';

describe('quantityFromLegacyDelta', () => {
  it('takes the magnitude of a negative stock delta', () => {
    expect(quantityFromLegacyDelta(-1)).toBe(1);
    expect(quantityFromLegacyDelta(-10)).toBe(10);
  });

  it('imports a zero delta as 1 — used, count not recorded', () => {
    expect(quantityFromLegacyDelta(0)).toBe(1);
  });

  it('leaves an already-positive value alone', () => {
    expect(quantityFromLegacyDelta(3)).toBe(3);
  });
});
