import { LiveTrafficRoutingService } from './live-traffic-routing.service';
import { OsrmRoutingService } from './osrm-routing.service';
import { TrafficSamplingClient } from './traffic-sampling.interface';

describe('LiveTrafficRoutingService', () => {
  const origin = { latitude: 41.1, longitude: -8.6 };
  const destination = { latitude: 41.2, longitude: -8.5 };

  let osrm: jest.Mocked<Pick<OsrmRoutingService, 'geocode' | 'distanceMatrix'>>;
  let samplingClient: jest.Mocked<TrafficSamplingClient>;
  let service: LiveTrafficRoutingService;

  beforeEach(() => {
    osrm = {
      geocode: jest.fn().mockResolvedValue({ latitude: 41.0, longitude: -8.0 }),
      distanceMatrix: jest
        .fn()
        .mockResolvedValue([[{ durationSeconds: 900, distanceMeters: 15000, estimated: false }]]),
    };
    samplingClient = { sampleTravelTime: jest.fn() };
    service = new LiveTrafficRoutingService(osrm as unknown as OsrmRoutingService, samplingClient);
  });

  it('delegates geocoding to OsrmRoutingService — geocoding is never a traffic question', async () => {
    const result = await service.geocode('Rua Example, Porto');

    expect(osrm.geocode).toHaveBeenCalledWith('Rua Example, Porto');
    expect(result).toEqual({ latitude: 41.0, longitude: -8.0 });
  });

  it('returns a live sample as an exact answer, not an estimate, when the vendor has one', async () => {
    samplingClient.sampleTravelTime.mockResolvedValue({ durationSeconds: 1500, distanceMeters: 18000 });

    const [[cell]] = await service.distanceMatrix([origin], [destination], new Date('2026-09-14T15:00:00.000Z'));

    expect(cell).toEqual({ durationSeconds: 1500, distanceMeters: 18000, estimated: false });
    expect(osrm.distanceMatrix).not.toHaveBeenCalled();
  });

  it('falls back to the free-flow OSRM answer, flagged as an estimate, when the vendor has nothing', async () => {
    samplingClient.sampleTravelTime.mockResolvedValue(null);

    const [[cell]] = await service.distanceMatrix([origin], [destination], new Date('2026-09-14T15:00:00.000Z'));

    expect(cell).toEqual({ durationSeconds: 900, distanceMeters: 15000, estimated: true });
  });

  it('passes every pair to the sampling client, never touching the free-flow engine when the vendor answers all of them', async () => {
    samplingClient.sampleTravelTime.mockResolvedValue({ durationSeconds: 500, distanceMeters: 5000 });
    const originB = { latitude: 40.0, longitude: -7.0 };

    const matrix = await service.distanceMatrix([origin, originB], [destination]);

    expect(matrix).toHaveLength(2);
    expect(samplingClient.sampleTravelTime).toHaveBeenCalledTimes(2);
  });
});
