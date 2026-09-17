import { describe, expect, it } from 'vitest';
import { bearingDegrees, clampToFrameEdge, findOverlaps } from './geometry';

describe('clampToFrameEdge', () => {
  const container = { width: 400, height: 300 };

  it('returns null for a point already inside the margin-inset frame', () => {
    expect(clampToFrameEdge({ x: 200, y: 150 }, container)).toBeNull();
    expect(clampToFrameEdge({ x: 40, y: 40 }, container)).toBeNull();
  });

  it('clamps a point off the right edge to the frame’s right edge, at the centre height', () => {
    const clamped = clampToFrameEdge({ x: 900, y: 150 }, container, 28);
    expect(clamped).not.toBeNull();
    expect(clamped!.x).toBeCloseTo(400 - 28);
    expect(clamped!.y).toBeCloseTo(150);
  });

  it('clamps a point off the top edge to the frame’s top edge, at the centre width', () => {
    const clamped = clampToFrameEdge({ x: 200, y: -500 }, container, 28);
    expect(clamped!.x).toBeCloseTo(200);
    expect(clamped!.y).toBeCloseTo(28);
  });

  it('clamps a diagonal point to whichever edge it hits first, never past a corner', () => {
    // Far down-right of a 400x300 frame — hits the right edge before the
    // bottom one, since the frame is wider than it is tall relative to the
    // point's own slope here.
    const clamped = clampToFrameEdge({ x: 1000, y: 700 }, container, 28)!;
    expect(clamped.x).toBeLessThanOrEqual(400 - 28 + 0.001);
    expect(clamped.y).toBeLessThanOrEqual(300 - 28 + 0.001);
  });
});

describe('bearingDegrees', () => {
  it('reads due north as 0', () => {
    expect(bearingDegrees({ latitude: 41.0, longitude: -8.0 }, { latitude: 42.0, longitude: -8.0 })).toBeCloseTo(0, 0);
  });

  it('reads due east as 90', () => {
    expect(bearingDegrees({ latitude: 41.0, longitude: -8.0 }, { latitude: 41.0, longitude: -7.0 })).toBeCloseTo(90, 0);
  });

  it('reads due south as 180', () => {
    expect(bearingDegrees({ latitude: 41.0, longitude: -8.0 }, { latitude: 40.0, longitude: -8.0 })).toBeCloseTo(180, 0);
  });
});

describe('findOverlaps', () => {
  const braga = { latitude: 41.5454, longitude: -8.4265 };
  const nearBraga = { latitude: 41.546, longitude: -8.427 }; // ~100m away
  const porto = { latitude: 41.1496, longitude: -8.6109 }; // ~50km away

  const activeAt = (hour: number) => ({
    activeFrom: new Date(`2026-09-16T${String(hour).padStart(2, '0')}:00:00.000Z`),
    activeTo: new Date(`2026-09-16T${String(hour).padStart(2, '0')}:30:00.000Z`),
  });

  it('flags two corridors that pass close together while both are active', () => {
    const overlaps = findOverlaps([
      { tripId: 't1', journeyNumber: 1, points: [braga], ...activeAt(9) },
      { tripId: 't2', journeyNumber: 2, points: [nearBraga], ...activeAt(9) },
    ]);
    expect(overlaps).toEqual([
      { tripIdA: 't1', tripIdB: 't2', journeyNumberA: 1, journeyNumberB: 2, distanceKm: expect.any(Number) },
    ]);
    expect(overlaps[0].distanceKm).toBeLessThan(2);
  });

  it('never flags two corridors that are simply far apart, however close in time', () => {
    const overlaps = findOverlaps([
      { tripId: 't1', journeyNumber: 1, points: [braga], ...activeAt(9) },
      { tripId: 't2', journeyNumber: 2, points: [porto], ...activeAt(9) },
    ]);
    expect(overlaps).toEqual([]);
  });

  it('never flags two corridors that pass close together hours apart', () => {
    const overlaps = findOverlaps([
      { tripId: 't1', journeyNumber: 1, points: [braga], ...activeAt(9) },
      { tripId: 't2', journeyNumber: 2, points: [nearBraga], ...activeAt(15) },
    ]);
    expect(overlaps).toEqual([]);
  });

  it('is a hint only — it never returns more than one candidate per pair', () => {
    const overlaps = findOverlaps([
      { tripId: 't1', journeyNumber: 1, points: [braga, nearBraga], ...activeAt(9) },
      { tripId: 't2', journeyNumber: 2, points: [nearBraga, braga], ...activeAt(9) },
    ]);
    expect(overlaps).toHaveLength(1);
  });
});
