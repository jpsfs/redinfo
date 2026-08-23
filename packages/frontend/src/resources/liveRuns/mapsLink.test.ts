import { describe, expect, it } from 'vitest';
import { canNavigate, mapsUrl, navigationQuery, telUrl } from './mapsLink';

/**
 * The real risk in this file is not the URL shape — it is
 * `encodeURIComponent` on an address a Portuguese dispatcher actually reads out.
 * `R. Dr. Manuel Rodrigues nº 12, 3º Esq.` has full stops, a comma, an ordinal
 * and a non-ASCII character, and each of them breaks a hand-built query string
 * in a different way.
 */

const REAL_ADDRESS = 'R. Dr. Manuel Rodrigues nº 12, 3º Esq.';

describe('navigationQuery', () => {
  it('builds the finest destination it has, ending in Portugal', () => {
    expect(
      navigationQuery({ address: 'Rua da Boavista 12', locality: 'Taveiro', municipality: 'Coimbra' }),
    ).toBe('Rua da Boavista 12, Taveiro, Coimbra, Portugal');
  });

  it('settles for the locality when there is no street', () => {
    // A route to the middle of the right village beats no route at all.
    expect(navigationQuery({ locality: 'Taveiro', municipality: 'Coimbra' })).toBe(
      'Taveiro, Coimbra, Portugal',
    );
  });

  it('pins the country, so a Portuguese street is not a Brazilian one', () => {
    expect(navigationQuery({ address: 'Rua da Boavista' })).toBe('Rua da Boavista, Portugal');
  });

  it('is null when there is nothing to navigate to', () => {
    expect(navigationQuery({})).toBeNull();
    expect(navigationQuery({ address: '   ', locality: null })).toBeNull();
  });

  it('drops the blanks rather than leaving empty commas', () => {
    expect(navigationQuery({ address: 'Rua X', locality: '  ', municipality: 'Coimbra' })).toBe(
      'Rua X, Coimbra, Portugal',
    );
  });
});

describe('mapsUrl', () => {
  it('is the documented cross-platform form, with driving directions asked for', () => {
    const url = mapsUrl({ address: 'Rua X', locality: 'Taveiro' });
    expect(url).toContain('https://www.google.com/maps/dir/?api=1');
    expect(url).toContain('travelmode=driving');
  });

  it('survives a real Portuguese address', () => {
    const url = mapsUrl({ address: REAL_ADDRESS, locality: 'Taveiro', municipality: 'Coimbra' });
    expect(url).not.toBeNull();

    // The round trip is the assertion: whatever the encoding did, Google has to
    // be able to read the address back out of it.
    const destination = new URL(url!).searchParams.get('destination');
    expect(destination).toBe(`${REAL_ADDRESS}, Taveiro, Coimbra, Portugal`);
  });

  it('leaves no raw space, comma or ordinal in the query string', () => {
    const url = mapsUrl({ address: REAL_ADDRESS })!;
    const query = url.slice(url.indexOf('destination='));
    expect(query).not.toContain(' ');
    expect(query).not.toContain('º');
    // A raw comma would end the destination parameter early, sending the crew to
    // "R. Dr. Manuel Rodrigues nº 12" and dropping the floor.
    expect(query.split('&')[0]).not.toContain(',');
  });

  it('is null with nothing to go on, so the screen shows no dead button', () => {
    expect(mapsUrl({})).toBeNull();
    expect(canNavigate({})).toBe(false);
    expect(canNavigate({ locality: 'Taveiro' })).toBe(true);
  });
});

describe('telUrl', () => {
  it('strips the spaces a dialler would stop at', () => {
    expect(telUrl('+351 800 203 264')).toBe('tel:+351800203264');
  });

  it('keeps the leading plus, which is what makes it dialable abroad', () => {
    expect(telUrl('+351800203264')).toBe('tel:+351800203264');
  });

  it('is null for nothing configured', () => {
    expect(telUrl(null)).toBeNull();
    expect(telUrl('')).toBeNull();
    expect(telUrl('   ')).toBeNull();
  });
});
