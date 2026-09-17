import { Injectable, Logger } from '@nestjs/common';
import { Coordinates } from './routing.interface';
import { TrafficSamplingClient, TrafficTravelTimeSample } from './traffic-sampling.interface';

/**
 * Default `TrafficSamplingClient` (#232) until a real vendor is chosen —
 * see that interface's own doc comment on checking licence terms first.
 * Fails soft exactly like `NotificationQueueService` without a Resend key:
 * the quarterly sampler still runs and the live-dispatch escape hatch still
 * resolves, both just get "no data" for every corridor — a missing corridor
 * factor already means `1.0` (`TrafficCorridorFactorService.lookup`), so
 * this is safe to ship ahead of a vendor decision rather than blocking on
 * one.
 */
@Injectable()
export class DisabledTrafficSamplingClient implements TrafficSamplingClient {
  private readonly logger = new Logger(DisabledTrafficSamplingClient.name);
  private warned = false;

  async sampleTravelTime(
    _origin: Coordinates,
    _destination: Coordinates,
    _departAt: Date,
  ): Promise<TrafficTravelTimeSample | null> {
    if (!this.warned) {
      this.logger.warn(
        'No TrafficSamplingClient configured — traffic factors will not be sampled, and live-dispatch corrections will fall back to free-flow.',
      );
      this.warned = true;
    }
    return null;
  }
}
