import { describe, expect, it } from 'vitest';
import { journeyColorRamp } from '../../layout/design-tokens';
import { journeyColorForOrdinal } from './journeyColor';

describe('journeyColorForOrdinal', () => {
  it('gives the first journey the first hue', () => {
    expect(journeyColorForOrdinal(1)).toBe(journeyColorRamp[0]);
  });

  it('cycles back to the first hue after the ramp runs out', () => {
    expect(journeyColorForOrdinal(9)).toBe(journeyColorRamp[0]);
    expect(journeyColorForOrdinal(10)).toBe(journeyColorRamp[1]);
  });

  it('gives every ordinal within the ramp its own hue', () => {
    const colours = new Set(journeyColorRamp.map((_, i) => journeyColorForOrdinal(i + 1)));
    expect(colours.size).toBe(journeyColorRamp.length);
  });
});
