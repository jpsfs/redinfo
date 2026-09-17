import { shiftBoundaryToInstant } from './timezone.util';

// ── Shift boundary → instant, across the DST line (#164) ───────────────────────
//
// A shift's own hours never change with the seasons; what changes is the UTC
// offset needed to compare them against a report's timestamp.

describe('shiftBoundaryToInstant', () => {
  it('resolves a winter (WET, UTC+0) shift boundary with no offset', () => {
    // 20:00 on 2026-01-15 (well outside DST) is 20:00 UTC.
    const instant = shiftBoundaryToInstant('2026-01-15', 20 * 60);
    expect(instant.toISOString()).toBe('2026-01-15T20:00:00.000Z');
  });

  it('resolves a summer (WEST, UTC+1) shift boundary an hour earlier in UTC', () => {
    // 20:00 on 2026-07-15 (deep in DST) is 19:00 UTC.
    const instant = shiftBoundaryToInstant('2026-07-15', 20 * 60);
    expect(instant.toISOString()).toBe('2026-07-15T19:00:00.000Z');
  });

  it('rolls minute 1440 (midnight) onto the next calendar date', () => {
    const instant = shiftBoundaryToInstant('2026-01-15', 1440);
    expect(instant.toISOString()).toBe('2026-01-16T00:00:00.000Z');
  });

  it('is still WEST on 1 October — DST does not end until late October', () => {
    const instant = shiftBoundaryToInstant('2026-10-01', 1440);
    expect(instant.toISOString()).toBe('2026-10-01T23:00:00.000Z');
  });
});
