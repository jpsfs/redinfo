import { isValidEmailShape, normaliseEmail, placeholderEmail, resolveEmail } from './email';

describe('normaliseEmail', () => {
  it('trims and lowercases', () => {
    expect(normaliseEmail('  Joao.Silva@Example.COM  ')).toBe('joao.silva@example.com');
  });

  it('blank becomes null', () => {
    expect(normaliseEmail('')).toBeNull();
    expect(normaliseEmail('   ')).toBeNull();
    expect(normaliseEmail(null)).toBeNull();
    expect(normaliseEmail(undefined)).toBeNull();
  });
});

describe('isValidEmailShape', () => {
  it('accepts an ordinary address', () => {
    expect(isValidEmailShape('a@b.com')).toBe(true);
  });

  it('rejects an obviously invalid string', () => {
    expect(isValidEmailShape('not-an-email')).toBe(false);
    expect(isValidEmailShape('a@b')).toBe(false);
    expect(isValidEmailShape('@b.com')).toBe(false);
  });
});

describe('placeholderEmail', () => {
  it('is deterministic per legacy id', () => {
    expect(placeholderEmail('42')).toBe('v-42@import.invalid');
  });
});

describe('resolveEmail', () => {
  it('keeps a valid, unclaimed email as-is and claims it', () => {
    const seen = new Set<string>();
    const result = resolveEmail('1', 'Joao@Example.com', seen);
    expect(result).toEqual({ email: 'joao@example.com', source: 'legacy' });
    expect(seen.has('joao@example.com')).toBe(true);
  });

  it('a blank email gets the placeholder', () => {
    const result = resolveEmail('7', '', new Set());
    expect(result).toEqual({ email: 'v-7@import.invalid', source: 'placeholder', reason: 'BLANK' });
  });

  it('an obviously invalid string gets the placeholder', () => {
    const result = resolveEmail('8', 'not-an-email', new Set());
    expect(result).toEqual({
      email: 'v-8@import.invalid',
      source: 'placeholder',
      reason: 'INVALID_SHAPE',
    });
  });

  it('the first row to claim an address wins; the second colliding row falls back to its own placeholder', () => {
    const seen = new Set<string>();
    const first = resolveEmail('1', 'shared@example.com', seen);
    const second = resolveEmail('2', 'shared@example.com', seen);

    expect(first).toEqual({ email: 'shared@example.com', source: 'legacy' });
    expect(second).toEqual({
      email: 'v-2@import.invalid',
      source: 'placeholder',
      reason: 'DUPLICATE',
    });
  });

  it('is case-insensitive when detecting a duplicate', () => {
    const seen = new Set<string>();
    resolveEmail('1', 'Shared@Example.com', seen);
    const second = resolveEmail('2', 'shared@example.com', seen);
    expect(second.reason).toBe('DUPLICATE');
  });
});
