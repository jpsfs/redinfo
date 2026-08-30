import { UNKNOWN_NAME_PLACEHOLDER, normaliseWhitespace, splitPortugueseName } from './name';

describe('splitPortugueseName', () => {
  it('splits a simple two-token name', () => {
    expect(splitPortugueseName('João Silva')).toEqual({ firstName: 'João', lastName: 'Silva' });
  });

  it('takes the first token as the given name and the rest as the surname', () => {
    expect(splitPortugueseName('Maria da Conceição Alves Pereira')).toEqual({
      firstName: 'Maria',
      lastName: 'da Conceição Alves Pereira',
    });
  });

  it('handles a single-token name by using it for both parts', () => {
    expect(splitPortugueseName('Madonna')).toEqual({ firstName: 'Madonna', lastName: 'Madonna' });
  });

  it('preserves ALL CAPS input as-is', () => {
    expect(splitPortugueseName('JOÃO SILVA')).toEqual({ firstName: 'JOÃO', lastName: 'SILVA' });
  });

  it('collapses extra whitespace', () => {
    expect(splitPortugueseName('  João   Pedro   Silva  ')).toEqual({
      firstName: 'João',
      lastName: 'Pedro Silva',
    });
  });

  it('never returns an empty lastName — a blank input gets the placeholder', () => {
    expect(splitPortugueseName('')).toEqual({
      firstName: UNKNOWN_NAME_PLACEHOLDER,
      lastName: UNKNOWN_NAME_PLACEHOLDER,
    });
    expect(splitPortugueseName(null)).toEqual({
      firstName: UNKNOWN_NAME_PLACEHOLDER,
      lastName: UNKNOWN_NAME_PLACEHOLDER,
    });
    expect(splitPortugueseName('   ')).toEqual({
      firstName: UNKNOWN_NAME_PLACEHOLDER,
      lastName: UNKNOWN_NAME_PLACEHOLDER,
    });
  });
});

describe('normaliseWhitespace', () => {
  it('collapses internal runs and trims the ends', () => {
    expect(normaliseWhitespace('  a   b\tc  ')).toBe('a b c');
  });
});
