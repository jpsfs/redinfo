import { Inject, Injectable } from '@nestjs/common';
import { OsrmRoutingService } from './osrm-routing.service';
import { Coordinates, RoutingMatrixCell, RoutingService } from './routing.interface';
import { TRAFFIC_SAMPLING_CLIENT, TrafficSamplingClient } from './traffic-sampling.interface';

/**
 * The escape hatch #232 asks for: live traffic for day-of dispatch
 * re-planning ("the driver is stuck on the A3, who covers the 15:00
 * pickup"), behind the same `RoutingService` interface the free-flow
 * planning path (`PlannedDurationService`) uses.
 *
 * Deliberately **not** bound to the `ROUTING_SERVICE` token in
 * `RoutingModule` — planning depends on that token for its full
 * stop-by-stop matrix, recomputed every time the planner moves something,
 * and must never end up calling a live, priced-per-request traffic API for
 * that (the whole reason #219 splits planning traffic from dispatch
 * traffic). A future dispatch feature injects this class directly instead.
 *
 * `geocode` delegates straight to `OsrmRoutingService` — geocoding an
 * address is never a traffic question, so there is no reason to spend the
 * live budget on it. `distanceMatrix` asks the same swappable
 * `TrafficSamplingClient` the quarterly sampler uses; a pair the vendor has
 * no live answer for falls back to the free-flow number planning would use,
 * flagged `estimated: true` exactly like an out-of-region OSRM pair.
 */
@Injectable()
export class LiveTrafficRoutingService implements RoutingService {
  constructor(
    private readonly osrm: OsrmRoutingService,
    @Inject(TRAFFIC_SAMPLING_CLIENT) private readonly samplingClient: TrafficSamplingClient,
  ) {}

  geocode(address: string): Promise<Coordinates | null> {
    return this.osrm.geocode(address);
  }

  // Route geometry is a planning-time, drawn-once-per-lane concern (#247
  // stage 4), never a live, per-request question the way a duration is —
  // delegates straight to the free-flow engine, same as `geocode`.
  routeGeometry(points: Coordinates[]): Promise<string | null> {
    return this.osrm.routeGeometry(points);
  }

  async distanceMatrix(
    origins: Coordinates[],
    destinations: Coordinates[],
    departAt: Date = new Date(),
  ): Promise<RoutingMatrixCell[][]> {
    return Promise.all(
      origins.map((origin) => Promise.all(destinations.map((destination) => this.liveCell(origin, destination, departAt)))),
    );
  }

  private async liveCell(origin: Coordinates, destination: Coordinates, departAt: Date): Promise<RoutingMatrixCell> {
    const sample = await this.samplingClient.sampleTravelTime(origin, destination, departAt);
    if (sample) {
      return { durationSeconds: sample.durationSeconds, distanceMeters: sample.distanceMeters, estimated: false };
    }

    // No live answer for this pair right now — the same free-flow fallback
    // planning would use, flagged as such.
    const [[freeFlow]] = await this.osrm.distanceMatrix([origin], [destination]);
    return { ...freeFlow, estimated: true };
  }
}
