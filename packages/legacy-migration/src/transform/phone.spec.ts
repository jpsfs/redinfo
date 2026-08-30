import { phoneFromLegacyInt } from './phone';

describe('phoneFromLegacyInt', () => {
  it('converts an ordinary mobile number to a string', () => {
    expect(phoneFromLegacyInt(912345678)).toBe('912345678');
  });

  it('0 means "no phone" — legacy sets it deliberately (NO_AUTO_VALUE_ON_ZERO)', () => {
    expect(phoneFromLegacyInt(0)).toBeNull();
  });

  it('null and undefined are both "no phone"', () => {
    expect(phoneFromLegacyInt(null)).toBeNull();
    expect(phoneFromLegacyInt(undefined)).toBeNull();
  });

  it('does not fabricate a leading zero the int storage already discarded', () => {
    // A legacy landline once typed "022123456" is already 22123456 by the
    // time it reaches this function — nothing here can or should re-pad it.
    expect(phoneFromLegacyInt(22123456)).toBe('22123456');
  });
});
