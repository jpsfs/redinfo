import { UNKNOWN_NAME_PLACEHOLDER, normaliseWhitespace, splitPortugueseName } from './name';

describe('splitPortugueseName', () => {
  it('splits a simple two-token name', () => {
    expect(splitPortugueseName('João Silva')).toEqual({ firstName: 'João', lastName: 'Silva' });
  });

  it('takes the first token as the given name and only the last token as the surname, dropping middle names', () => {
    expect(splitPortugueseName('Maria da Conceição Alves Pereira')).toEqual({
      firstName: 'Maria',
      lastName: 'Pereira',
    });
  });

  it('matches the Diana Esmeralda Duarte Costa case: First Last only, middle names dropped', () => {
    expect(splitPortugueseName('Diana Esmeralda Duarte Costa')).toEqual({
      firstName: 'Diana',
      lastName: 'Costa',
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
      lastName: 'Silva',
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
