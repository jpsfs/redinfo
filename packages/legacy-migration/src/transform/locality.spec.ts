import {
  LocalityCandidate,
  buildMergedFreguesiaIndex,
  nearestCandidates,
  resolveLocalityCandidates,
  resolveMergedFreguesia,
  unionFreguesiaMembers,
} from './locality';

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

describe('unionFreguesiaMembers', () => {
  it('returns null for a name that is not compound at all', () => {
    expect(unionFreguesiaMembers('Roriz')).toBeNull();
  });

  it('splits a "União das Freguesias de A e B" name into its members', () => {
    expect(unionFreguesiaMembers('União das Freguesias de Durrães e Tregosa')).toEqual(['Durrães', 'Tregosa']);
  });

  it('splits a bare "A e B" compound name with no prefix', () => {
    expect(unionFreguesiaMembers('Navió e Vitorino dos Piães')).toEqual(['Navió', 'Vitorino dos Piães']);
  });

  it('splits a three-way ", " + " e " list', () => {
    expect(unionFreguesiaMembers('Ardegão, Freixo e Mato')).toEqual(['Ardegão', 'Freixo', 'Mato']);
  });

  it('expands a shared-head parenthetical qualifier into both members, keeping the whole clause too', () => {
    const members = unionFreguesiaMembers('União das Freguesias de Alvito (São Pedro e São Martinho) e Couto');
    expect(members).toEqual(['Alvito (São Pedro e São Martinho)', 'Couto', 'Alvito São Pedro', 'Alvito São Martinho']);
  });

  it('does not expand a parenthetical qualifier with no "e" inside it', () => {
    expect(unionFreguesiaMembers('Campo e Tamel (São Pedro Fins)')).toEqual(['Campo', 'Tamel (São Pedro Fins)']);
  });
});

describe('resolveMergedFreguesia', () => {
  const HOME = 'Barcelos';
  const NEIGHBOURS = ['Viana do Castelo', 'Ponte de Lima'];

  it('resolves a merged freguesia that is unique across the whole dataset', () => {
    const union = candidate('1', 'União das Freguesias de Durrães e Tregosa', HOME);
    const index = buildMergedFreguesiaIndex([union]);
    const result = resolveMergedFreguesia('TREGOSA', [], index, HOME, NEIGHBOURS);
    expect(result).toEqual({ candidate: union, tiebreak: 'unique' });
  });

  it('breaks a tie toward the home municipality when the merged match is otherwise ambiguous', () => {
    const barcelosCampo = candidate('1', 'União das Freguesias de Campo e Tamel (São Pedro Fins)', HOME);
    const valongoCampo = candidate('2', 'Campo', 'Valongo');
    const index = buildMergedFreguesiaIndex([barcelosCampo]);
    // `knownCandidates` stands in for what tier 1 already found ambiguous (an exact "Campo" elsewhere).
    const result = resolveMergedFreguesia('CAMPO', [valongoCampo], index, HOME, NEIGHBOURS);
    expect(result).toEqual({ candidate: barcelosCampo, tiebreak: 'home-municipality' });
  });

  it('falls back to a confirmed neighbouring municipality when the home municipality is not a candidate', () => {
    const viana = candidate('1', 'Carvoeiro', 'Viana do Castelo');
    const other = candidate('2', 'Carvoeiro', 'Lagoa');
    const index = buildMergedFreguesiaIndex([]);
    const result = resolveMergedFreguesia('Carvoeiro', [viana, other], index, HOME, NEIGHBOURS);
    expect(result).toEqual({ candidate: viana, tiebreak: 'neighbouring-municipality' });
  });

  it('prefers the home municipality over a neighbour when both are candidates', () => {
    const barcelos = candidate('1', 'Arcozelo', HOME);
    const ponteDeLima = candidate('2', 'Arcozelo', 'Ponte de Lima');
    const index = buildMergedFreguesiaIndex([]);
    const result = resolveMergedFreguesia('ARCOZELO', [barcelos, ponteDeLima], index, HOME, NEIGHBOURS);
    expect(result).toEqual({ candidate: barcelos, tiebreak: 'home-municipality' });
  });

  it('stays unresolved — never guesses — when two different neighbouring municipalities both remain candidates', () => {
    const ponteDeLima = candidate('1', 'Vila Verde', 'Ponte de Lima');
    const viana = candidate('2', 'Vila Verde', 'Viana do Castelo');
    const index = buildMergedFreguesiaIndex([]);
    const result = resolveMergedFreguesia('VILA VERDE', [ponteDeLima, viana], index, HOME, NEIGHBOURS);
    expect(result).toBeNull();
  });

  it('returns null when there is nothing to go on at all', () => {
    const index = buildMergedFreguesiaIndex([]);
    expect(resolveMergedFreguesia('nothing-like-it', [], index, HOME, NEIGHBOURS)).toBeNull();
  });
});
