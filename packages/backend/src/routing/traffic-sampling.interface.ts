import { Coordinates } from './routing.interface';

export interface TrafficTravelTimeSample {
  durationSeconds: number;
  distanceMeters: number;
}

/**
 * The commercial traffic-aware API boundary (#232) — swappable so choosing,
 * or later re-choosing, a vendor is a `RoutingModule` provider change, never
 * a change to `TrafficCorridorSamplerService` (the quarterly job) or
 * `LiveTrafficRoutingService` (the day-of dispatch escape hatch), the two
 * callers of this interface.
 *
 * Every implementation may only ever be called with a `Locality` centroid
 * or a `Facility`'s own coordinates — `Coordinates` carries nothing else,
 * so a patient's address structurally cannot reach it. See
 * `routing.module.ts`'s doc comment.
 *
 * Check the free tier's licence terms before wiring a real vendor in —
 * some restrict commercial use (the ticket's own note).
 */
export interface TrafficSamplingClient {
  /** Traffic-aware duration/distance for one origin → destination at a specific departure instant, or `null` if the vendor has no answer. */
  sampleTravelTime(
    origin: Coordinates,
    destination: Coordinates,
    departAt: Date,
  ): Promise<TrafficTravelTimeSample | null>;
}

/** DI token — see `TrafficSamplingClient`'s own doc comment for why this is an interface at all. */
export const TRAFFIC_SAMPLING_CLIENT = Symbol('TRAFFIC_SAMPLING_CLIENT');
