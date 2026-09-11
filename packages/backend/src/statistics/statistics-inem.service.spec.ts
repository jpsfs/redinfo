import { StatisticsInemService } from './statistics-inem.service';

const PERIOD = (overrides: Record<string, unknown> = {}) => ({
  unitId: 'CVCAMPO1',
  vehicleId: 'v-1',
  inopCode: '00',
  startedAt: new Date('2026-06-01T00:00:00.000Z'),
  endedAt: new Date('2026-06-01T01:00:00.000Z'),
  ...overrides,
});

function makeService(periods: Record<string, unknown>[], vehicles: Record<string, unknown>[] = []) {
  const prisma = {
    iNEMUnitStatusPeriod: { findMany: jest.fn().mockResolvedValue(periods) },
    vehicle: { findMany: jest.fn().mockResolvedValue(vehicles) },
  };
  return { service: new StatisticsInemService(prisma as never), prisma };
}

const RANGE = { from: '2026-06-01', to: '2026-06-30' };

describe('StatisticsInemService.getStatistics', () => {
  it('splits minutes between available time and downtime-by-reason for the same unit', async () => {
    const { service } = makeService([
      PERIOD({ inopCode: '00', startedAt: new Date('2026-06-01T00:00:00Z'), endedAt: new Date('2026-06-01T01:00:00Z') }),
      PERIOD({ inopCode: 'TEPH_Falta', startedAt: new Date('2026-06-01T01:00:00Z'), endedAt: new Date('2026-06-01T03:00:00Z') }),
    ]);
    const stats = await service.getStatistics(RANGE);

    expect(stats.units).toEqual([
      expect.objectContaining({
        unitId: 'CVCAMPO1',
        availableMinutes: 60,
        totalDowntimeMinutes: 120,
        downtimeByReason: [{ inopCode: 'TEPH_Falta', minutes: 120 }],
      }),
    ]);
    expect(stats.totalDowntimeMinutes).toBe(120);
    expect(stats.downtimeByReason).toEqual([{ inopCode: 'TEPH_Falta', minutes: 120 }]);
  });

  it('clips a period that started before "from" to the range boundary', async () => {
    const { service } = makeService([
      PERIOD({
        inopCode: 'Alimentacao',
        startedAt: new Date('2026-05-31T22:00:00Z'), // 2h before the range starts
        endedAt: new Date('2026-06-01T02:00:00Z'),
      }),
    ]);
    const stats = await service.getStatistics(RANGE);

    // Only the 2h inside [from, to] count, not the full 4h span.
    expect(stats.units[0].totalDowntimeMinutes).toBe(120);
  });

  it('clips a still-open period (endedAt: null) to the end of the range, not to "now"', async () => {
    const { service } = makeService([
      PERIOD({
        inopCode: '00',
        startedAt: new Date('2026-06-30T23:00:00Z'),
        endedAt: null,
      }),
    ]);
    const stats = await service.getStatistics(RANGE);

    // Range ends at the exclusive boundary 2026-07-01T00:00:00Z — exactly 1h
    // after the period opened, however long ago "now" actually is.
    expect(stats.units[0].availableMinutes).toBe(60);
  });

  it('drops a unit from the output entirely when its only period clips to zero minutes', async () => {
    const { service } = makeService([
      PERIOD({ startedAt: new Date('2026-05-01T00:00:00Z'), endedAt: new Date('2026-05-01T01:00:00Z') }),
    ]);
    const stats = await service.getStatistics(RANGE);

    expect(stats.units).toEqual([]);
  });

  it('sorts both the reason breakdown and the unit list by minutes descending', async () => {
    const { service } = makeService([
      PERIOD({ unitId: 'U1', inopCode: 'Alimentacao', startedAt: new Date('2026-06-01T00:00:00Z'), endedAt: new Date('2026-06-01T00:30:00Z') }),
      PERIOD({ unitId: 'U1', inopCode: 'TEPH_Falta', startedAt: new Date('2026-06-01T01:00:00Z'), endedAt: new Date('2026-06-01T03:00:00Z') }),
      PERIOD({ unitId: 'U2', inopCode: 'TEPH_Falta', startedAt: new Date('2026-06-02T00:00:00Z'), endedAt: new Date('2026-06-02T00:15:00Z') }),
    ]);
    const stats = await service.getStatistics(RANGE);

    expect(stats.units.map((u) => u.unitId)).toEqual(['U1', 'U2']);
    expect(stats.units[0].downtimeByReason.map((r) => r.inopCode)).toEqual(['TEPH_Falta', 'Alimentacao']);
    expect(stats.downtimeByReason).toEqual([
      { inopCode: 'TEPH_Falta', minutes: 135 },
      { inopCode: 'Alimentacao', minutes: 30 },
    ]);
  });

  it('joins each unit to its vehicle, and leaves it null when there is no match', async () => {
    const { service, prisma } = makeService(
      [
        PERIOD({ unitId: 'CVCAMPO1', vehicleId: 'v-1', inopCode: 'TEPH_Falta' }),
        PERIOD({ unitId: 'CVCAMPO2', vehicleId: null, inopCode: 'TEPH_Falta' }),
      ],
      [{ id: 'v-1', licensePlate: '80-PS-45', numeroCauda: 'CV1' }],
    );
    const stats = await service.getStatistics(RANGE);

    expect(prisma.vehicle.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['v-1'] } },
      select: { id: true, licensePlate: true, numeroCauda: true },
    });
    expect(stats.units.find((u) => u.unitId === 'CVCAMPO1')?.vehicle).toEqual({
      id: 'v-1',
      licensePlate: '80-PS-45',
      numeroCauda: 'CV1',
    });
    expect(stats.units.find((u) => u.unitId === 'CVCAMPO2')?.vehicle).toBeNull();
  });
});
