import { LocalityCandidate, nearestCandidates, resolveLocalityCandidates } from './locality';

const candidate = (id: string, name: string, municipalityName: string): LocalityCandidate => ({
  id,
  name,
  searchName: name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim(),
  municipalityName,
});

describe('resolveLocalityCandidates', () => {
  it('matches folding exactly — case and accents do not matter', () => {
    const list = [candidate('1', 'São Martinho', 'Barcelos')];
    expect(resolveLocalityCandidates('sao martinho', list)).toEqual({
      kind: 'EXACT',
      candidate: list[0],
    });
    expect(resolveLocalityCandidates('SÃO MARTINHO', list)).toEqual({
      kind: 'EXACT',
      candidate: list[0],
    });
  });

  it('falls back to a unique prefix match when there is no exact one', () => {
    const list = [candidate('1', 'São Martinho do Bispo', 'Coimbra')];
    expect(resolveLocalityCandidates('sao martinho', list)).toEqual({
      kind: 'UNIQUE_PREFIX',
      candidate: list[0],
    });
  });

  it('does not silently resolve an ambiguous exact match', () => {
    const list = [candidate('1', 'Airão', 'Vila Verde'), candidate('2', 'Airão', 'Guimarães')];
    const result = resolveLocalityCandidates('airao', list);
    expect(result.kind).toBe('AMBIGUOUS');
    if (result.kind !== 'AMBIGUOUS') return;
    expect(result.candidates).toHaveLength(2);
  });

  it('does not silently resolve an ambiguous prefix match', () => {
    const list = [
      candidate('1', 'Carvalhal Redondo', 'A'),
      candidate('2', 'Carvalhal de Vermilhas', 'B'),
    ];
    const result = resolveLocalityCandidates('carvalhal', list);
    expect(result.kind).toBe('AMBIGUOUS');
  });

  it('returns NONE when nothing matches at all', () => {
    const list = [candidate('1', 'Barcelos', 'Barcelos')];
    expect(resolveLocalityCandidates('not-a-real-place', list)).toEqual({ kind: 'NONE' });
  });
});

describe('nearestCandidates', () => {
  it('ranks by folded-token overlap, most first, ties broken alphabetically', () => {
    const list = [
      candidate('1', 'Vila Nova de Famalicão', 'Famalicão'),
      candidate('2', 'Vila Nova de Gaia', 'Gaia'),
      candidate('3', 'Barcelos', 'Barcelos'),
    ];
    const result = nearestCandidates('vila nova', list, 2);
    expect(result.map((c) => c.id)).toEqual(['1', '2']);
  });

  it('excludes anything with zero token overlap', () => {
    const list = [candidate('1', 'Barcelos', 'Barcelos')];
    expect(nearestCandidates('zzz-nothing-like-it', list)).toEqual([]);
  });
});
