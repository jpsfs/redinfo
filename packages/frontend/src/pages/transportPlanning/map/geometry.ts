import { distanceInKm } from '@redinfo/shared';

/**
 * Where a point that has scrolled outside the map's visible frame should
 * draw its off-frame chevron (#247 stage 4, design doc §5) — the
 * intersection of the container's own margin-inset rectangle with the
 * straight line from its centre to the point's pixel position. Pure pixel
 * geometry: `MapPanel` supplies `pointPx` via `maplibregl.Map#project`,
 * which is the one part of this that needs a real map instance, and this
 * function never needs one itself.
 *
 * Returns `null` when the point is already inside the frame (no chevron
 * needed) — including the degenerate `pointPx` exactly at the centre,
 * which cannot point in any direction.
 */
export function clampToFrameEdge(
  pointPx: { x: number; y: number },
  containerSize: { width: number; height: number },
  margin = 28,
): { x: number; y: number } | null {
  const withinFrame =
    pointPx.x >= margin &&
    pointPx.x <= containerSize.width - margin &&
    pointPx.y >= margin &&
    pointPx.y <= containerSize.height - margin;
  if (withinFrame) return null;

  const cx = containerSize.width / 2;
  const cy = containerSize.height / 2;
  const dx = pointPx.x - cx;
  const dy = pointPx.y - cy;
  if (dx === 0 && dy === 0) return null;

  const halfW = Math.max(containerSize.width / 2 - margin, 1);
  const halfH = Math.max(containerSize.height / 2 - margin, 1);
  // The smaller of the two scale factors is the one that hits an edge
  // first — the larger would overshoot past a corner.
  const scale = Math.min(
    dx !== 0 ? Math.abs(halfW / dx) : Infinity,
    dy !== 0 ? Math.abs(halfH / dy) : Infinity,
  );
  return { x: cx + dx * scale, y: cy + dy * scale };
}

/**
 * Compass bearing (degrees, 0 = north, clockwise) from one point to
 * another — which way an off-frame chevron should point. Haversine-style
 * initial bearing, the standard formula; not in `packages/shared` because
 * nothing outside this one chevron glyph needs it (see `distanceInKm`
 * there for the geometry this app's domain layer *does* share).
 */
export function bearingDegrees(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);
  const deltaLon = toRad(to.longitude - from.longitude);

  const y = Math.sin(deltaLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);
  const bearing = (Math.atan2(y, x) * 180) / Math.PI;
  return (bearing + 360) % 360;
}

export interface OverlapCandidate {
  tripIdA: string;
  tripIdB: string;
  journeyNumberA: number;
  journeyNumberB: number;
  distanceKm: number;
}

interface OverlapLane {
  tripId: string;
  journeyNumber: number;
  points: Array<{ latitude: number; longitude: number }>;
  activeFrom: Date;
  activeTo: Date;
}

/**
 * A corridor overlap hint (#247 stage 4, design doc §5): two journeys whose
 * routes pass within `distanceKmThreshold` of each other while both are
 * active within `minutesThreshold` of one another. A hint only — this
 * never merges or reassigns anything; the planner decides what, if
 * anything, a shared corridor is worth.
 *
 * Deliberately coarse: each route is downsampled to `maxSamplePoints`
 * before the nearest-point check, so this stays close to linear rather
 * than comparing every polyline vertex pair — a planner is looking for
 * "roughly the same road around the same time", not a geometric proof.
 */
export function findOverlaps(
  lanes: OverlapLane[],
  distanceKmThreshold = 2,
  minutesThreshold = 10,
  maxSamplePoints = 20,
): OverlapCandidate[] {
  const sampled = lanes.map((lane) => ({ ...lane, points: samplePoints(lane.points, maxSamplePoints) }));
  const overlaps: OverlapCandidate[] = [];

  for (let i = 0; i < sampled.length; i++) {
    for (let j = i + 1; j < sampled.length; j++) {
      const a = sampled[i];
      const b = sampled[j];
      if (!activeWindowsOverlap(a, b, minutesThreshold)) continue;

      const closest = closestDistanceKm(a.points, b.points);
      if (closest !== null && closest <= distanceKmThreshold) {
        overlaps.push({
          tripIdA: a.tripId,
          tripIdB: b.tripId,
          journeyNumberA: a.journeyNumber,
          journeyNumberB: b.journeyNumber,
          distanceKm: closest,
        });
      }
    }
  }
  return overlaps;
}

function activeWindowsOverlap(a: OverlapLane, b: OverlapLane, minutesThreshold: number): boolean {
  const toleranceMs = minutesThreshold * 60_000;
  return (
    a.activeFrom.getTime() <= b.activeTo.getTime() + toleranceMs &&
    b.activeFrom.getTime() <= a.activeTo.getTime() + toleranceMs
  );
}

function closestDistanceKm(
  pointsA: Array<{ latitude: number; longitude: number }>,
  pointsB: Array<{ latitude: number; longitude: number }>,
): number | null {
  if (pointsA.length === 0 || pointsB.length === 0) return null;
  let min = Infinity;
  for (const a of pointsA) {
    for (const b of pointsB) {
      const d = distanceInKm(a, b);
      if (d < min) min = d;
    }
  }
  return min;
}

function samplePoints<T>(points: T[], maxPoints: number): T[] {
  if (points.length <= maxPoints) return points;
  const step = points.length / maxPoints;
  return Array.from({ length: maxPoints }, (_, i) => points[Math.floor(i * step)]);
}
