import { StatisticsActivityService } from './statistics-activity.service';

const REPORT = (overrides: Record<string, unknown> = {}) => ({
  type: 'EMERGENCY',
  occurredOn: new Date('2026-06-10T00:00:00.000Z'),
  activationAt: new Date('2026-06-10T10:00:00.000Z'), // Wed 10:00 UTC = 11:00 Lisbon (WEST) → band 2
  startedAt: new Date('2026-06-10T10:00:00.000Z'),
  locality: { id: 'l-1', name: 'Barcelos', municipality: { id: 'm-1', name: 'Barcelos' } },
  victims: [],
  inemSupportUnits: [],
  ...overrides,
});

function makeService(reports: Record<string, unknown>[], previousPeriodCount = 0) {
  const prisma = {
    eventReport: {
      findMany: jest.fn().mockResolvedValue(reports),
      count: jest.fn().mockResolvedValue(previousPeriodCount),
    },
  };
  return { service: new StatisticsActivityService(prisma as never), prisma };
}

describe('StatisticsActivityService.getStatistics', () => {
  it('only reads submitted reports in range', async () => {
    const { service, prisma } = makeService([]);
    await service.getStatistics({ from: '2026-06-01', to: '2026-06-30' });
    expect(prisma.eventReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ submittedAt: { not: null } }),
      }),
    );
  });

  it('applies the type filter to both the current and previous period query', async () => {
    const { service, prisma } = makeService([]);
    await service.getStatistics({ from: '2026-06-01', to: '2026-06-30', type: 'LOCAL_SUPPORT' as never });
    expect(prisma.eventReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ type: 'LOCAL_SUPPORT' }) }),
    );
    expect(prisma.eventReport.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ type: 'LOCAL_SUPPORT' }) }),
    );
  });

  it('counts events per type and totals', async () => {
    const { service } = makeService([REPORT({ type: 'EMERGENCY' }), REPORT({ type: 'LOCAL_SUPPORT' })], 3);
    const stats = await service.getStatistics({ from: '2026-06-01', to: '2026-06-30' });
    expect(stats.totalEvents).toBe(2);
    expect(stats.previousPeriodEvents).toBe(3);
    expect(stats.eventsByType).toEqual(
      expect.arrayContaining([
        { type: 'EMERGENCY', count: 1 },
        { type: 'LOCAL_SUPPORT', count: 1 },
        { type: 'CNE_SUPPORT', count: 0 },
      ]),
    );
  });

  it('buckets emergencies by weekday and 4-hour band in Lisbon local time, and ignores non-emergencies', async () => {
    const { service } = makeService([
      REPORT({ activationAt: new Date('2026-06-10T10:00:00.000Z') }), // Wed, band 2
      REPORT({ type: 'LOCAL_SUPPORT', activationAt: null, startedAt: new Date('2026-06-10T10:00:00.000Z') }),
    ]);
    const stats = await service.getStatistics({ from: '2026-06-01', to: '2026-06-30' });
    expect(stats.activationHeatmap).toEqual([{ weekday: 3, band: 2, count: 1 }]);
  });

  it('falls back to startedAt when an emergency has no activationAt', async () => {
    const { service } = makeService([
      REPORT({ activationAt: null, startedAt: new Date('2026-06-10T10:00:00.000Z') }),
    ]);
    const stats = await service.getStatistics({ from: '2026-06-01', to: '2026-06-30' });
    expect(stats.activationHeatmap).toEqual([{ weekday: 3, band: 2, count: 1 }]);
  });

  it('groups events by locality with a top-10-plus-rest split', async () => {
    const reports = Array.from({ length: 12 }, (_, i) =>
      REPORT({ locality: { id: `l-${i}`, name: `Loc ${i}`, municipality: { id: 'm-1', name: 'Barcelos' } } }),
    );
    const { service } = makeService(reports);
    const stats = await service.getStatistics({ from: '2026-06-01', to: '2026-06-30' });
    expect(stats.eventsByLocality).toHaveLength(10);
    expect(stats.eventsByLocalityOther).toBe(2);
  });

  it('counts victims, outcomes, and destination hospitals', async () => {
    const { service } = makeService([
      REPORT({
        victims: [
          {
            destinationKind: 'HOSPITAL',
            destinationHospital: { id: 'h-1', name: 'Hospital de Braga', municipality: { name: 'Braga' } },
          },
          { destinationKind: 'TREATED_ON_SCENE', destinationHospital: null },
        ],
      }),
    ]);
    const stats = await service.getStatistics({ from: '2026-06-01', to: '2026-06-30' });
    expect(stats.victimsAssisted).toBe(2);
    expect(stats.victimOutcomes).toEqual(
      expect.arrayContaining([
        { kind: 'HOSPITAL', count: 1 },
        { kind: 'TREATED_ON_SCENE', count: 1 },
      ]),
    );
    expect(stats.destinationHospitals).toEqual([
      { id: 'h-1', name: 'Hospital de Braga', municipality: 'Braga', count: 1 },
    ]);
  });

  it('groups INEM support units by unit type and base hospital', async () => {
    const { service } = makeService([
      REPORT({ inemSupportUnits: [{ unitType: 'VMER', hospital: { name: 'Hospital de Braga' } }] }),
      REPORT({ inemSupportUnits: [{ unitType: 'VMER', hospital: { name: 'Hospital de Braga' } }] }),
    ]);
    const stats = await service.getStatistics({ from: '2026-06-01', to: '2026-06-30' });
    expect(stats.inemUnits).toEqual([{ unitType: 'VMER', hospitalName: 'Hospital de Braga', count: 2 }]);
  });
});
