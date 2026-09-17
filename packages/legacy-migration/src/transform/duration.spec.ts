import { timeStringToMinutes } from './duration';

describe('timeStringToMinutes', () => {
  it('converts an ordinary duration', () => {
    expect(timeStringToMinutes('01:30:00')).toBe(90);
  });

  it('rounds seconds to the nearest minute', () => {
    expect(timeStringToMinutes('00:00:30')).toBe(1);
    expect(timeStringToMinutes('00:00:29')).toBe(0);
  });

  it('does not cap the hour component at 24 — this is a duration, not a time of day', () => {
    expect(timeStringToMinutes('30:15:00')).toBe(30 * 60 + 15);
  });

  it('handles a zero duration', () => {
    expect(timeStringToMinutes('00:00:00')).toBe(0);
  });
});
