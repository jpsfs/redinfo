import { StatisticsFleetService } from './statistics-fleet.service';

const VEHICLE_ROW = (overrides: Record<string, unknown> = {}) => ({
  vehicleId: 'v-1',
  reportId: 'r-1',
  kilometres: 28,
  report: { occurredOn: new Date('2026-06-10T00:00:00.000Z') },
  vehicle: { numeroCauda: 'ABT 01', licensePlate: 'AA-11-BB' },
  ...overrides,
});

const EMERGENCY_REPORT = (overrides: Record<string, unknown> = {}) => ({
  activationAt: new Date('2026-06-10T10:00:00.000Z'),
  sceneArrivalAt: new Date('2026-06-10T10:11:00.000Z'),
  sceneDepartureAt: new Date('2026-06-10T10:29:00.000Z'),
  hospitalArrivalAt: new Date('2026-06-10T10:45:00.000Z'),
  availableAt: new Date('2026-06-10T10:59:00.000Z'),
  ...overrides,
});

function makeService(
  vehicleRows: Record<string, unknown>[],
  emergencyReports: Record<string, unknown>[] = [],
) {
  const prisma = {
    eventReportVehicle: { findMany: jest.fn().mockResolvedValue(vehicleRows) },
    eventReport: { findMany: jest.fn().mockResolvedValue(emergencyReports) },
  };
  return { service: new StatisticsFleetService(prisma as never), prisma };
}

describe('StatisticsFleetService.getStatistics', () => {
  it('sums total kilometres and derives mean/median per event', async () => {
    const { service } = makeService([
      VEHICLE_ROW({ reportId: 'r-1', kilometres: 20 }),
      VEHICLE_ROW({ reportId: 'r-2', kilometres: 40 }),
    ]);
    const stats = await service.getStatistics({ from: '2026-06-01', to: '2026-06-30' });
    expect(stats.totalKilometres).toBe(60);
    expect(stats.eventCount).toBe(2);
    expect(stats.kmPerEventMean).toBe(30);
    expect(stats.kmPerEventMedian).toBe(30);
  });

  it('sums kilometres across multiple vehicles on the same report into that report’s total', async () => {
    const { service } = makeService([
      VEHICLE_ROW({ reportId: 'r-1', vehicleId: 'v-1', kilometres: 20 }),
      VEHICLE_ROW({ reportId: 'r-1', vehicleId: 'v-2', kilometres: 15 }),
    ]);
    const stats = await service.getStatistics({ from: '2026-06-01', to: '2026-06-30' });
    expect(stats.eventCount).toBe(1);
    expect(stats.kmPerEventMean).toBe(35);
  });

  it('groups kilometres per vehicle, by month', async () => {
    const { service } = makeService([
      VEHICLE_ROW({ vehicleId: 'v-1', kilometres: 20, report: { occurredOn: new Date('2026-06-10T00:00:00.000Z') } }),
      VEHICLE_ROW({ vehicleId: 'v-1', kilometres: 30, report: { occurredOn: new Date('2026-07-05T00:00:00.000Z') } }),
    ]);
    const stats = await service.getStatistics({ from: '2026-06-01', to: '2026-07-31' });
    expect(stats.vehicles).toEqual([
      expect.objectContaining({
        vehicleId: 'v-1',
        totalKilometres: 50,
        monthlyKilometres: [
          { month: '2026-06', value: 20 },
          { month: '2026-07', value: 30 },
        ],
      }),
    ]);
  });

  it('computes median and p90 per response leg, only over emergencies with both stamps', async () => {
    const { service } = makeService(
      [],
      [
        EMERGENCY_REPORT(),
        EMERGENCY_REPORT({ sceneArrivalAt: null }), // missing a stamp — excluded from that leg only
      ],
    );
    const stats = await service.getStatistics({ from: '2026-06-01', to: '2026-06-30' });
    const activationLeg = stats.responseLegs.find((l) => l.leg === 'ACTIVATION_TO_SCENE')!;
    expect(activationLeg.sampleSize).toBe(1);
    expect(activationLeg.medianMinutes).toBe(11);
  });

  it('computes total duration median independently of the per-leg medians', async () => {
    const { service } = makeService([], [EMERGENCY_REPORT()]);
    const stats = await service.getStatistics({ from: '2026-06-01', to: '2026-06-30' });
    expect(stats.totalDurationMedianMinutes).toBe(59);
    expect(stats.timedEmergencies).toBe(1);
    expect(stats.totalEmergencies).toBe(1);
  });

  it('returns an honestly empty response-legs section when filtered to a non-emergency type', async () => {
    const { service, prisma } = makeService([], [EMERGENCY_REPORT()]);
    const stats = await service.getStatistics({
      from: '2026-06-01',
      to: '2026-06-30',
      type: 'LOCAL_SUPPORT' as never,
    });
    expect(stats.totalEmergencies).toBe(0);
    expect(stats.responseLegs.every((l) => l.sampleSize === 0)).toBe(true);
    expect(prisma.eventReport.findMany).not.toHaveBeenCalled();
  });
});
