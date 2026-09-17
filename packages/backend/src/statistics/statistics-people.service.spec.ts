import { StatisticsPeopleService } from './statistics-people.service';

const HOURS_ENTRY = (overrides: Record<string, unknown> = {}) => ({
  userId: 'u-ana',
  user: { firstName: 'Ana', lastName: 'Silva' },
  minutes: 60,
  activityType: 'EMERGENCY',
  date: new Date('2026-06-10T00:00:00.000Z'),
  ...overrides,
});

const CREW_MEMBER = (overrides: Record<string, unknown> = {}) => ({
  userId: 'u-ana',
  report: { id: 'r-1', type: 'EMERGENCY', occurredOn: new Date('2026-06-10T00:00:00.000Z') },
  ...overrides,
});

function makeService(entries: Record<string, unknown>[], crew: Record<string, unknown>[] = []) {
  const prisma = {
    volunteerHoursEntry: {
      findMany: jest.fn().mockResolvedValueOnce(entries).mockResolvedValue([]),
    },
    eventReportCrewMember: { findMany: jest.fn().mockResolvedValue(crew) },
    user: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const volunteerHours = { refreshGeneration: jest.fn().mockResolvedValue(undefined) };
  return { service: new StatisticsPeopleService(prisma as never, volunteerHours as never), prisma, volunteerHours };
}

describe('StatisticsPeopleService.getStatistics', () => {
  it('refreshes generation before reading, so a never-viewed period still reports fully', async () => {
    const { service, volunteerHours } = makeService([]);
    await service.getStatistics({ from: '2026-06-01', to: '2026-06-30' }, 'u-ana');
    expect(volunteerHours.refreshGeneration).toHaveBeenCalledTimes(1);
  });

  it('only reads approved, non-deleted entries', async () => {
    const { service, prisma } = makeService([]);
    await service.getStatistics({ from: '2026-06-01', to: '2026-06-30' }, 'u-ana');
    expect(prisma.volunteerHoursEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'APPROVED', deletedAt: null }),
      }),
    );
  });

  it('sums approved hours across the whole delegation', async () => {
    const { service } = makeService([
      HOURS_ENTRY({ userId: 'u-ana', minutes: 120 }),
      HOURS_ENTRY({ userId: 'u-bruno', user: { firstName: 'Bruno', lastName: 'Alves' }, minutes: 180 }),
    ]);
    const stats = await service.getStatistics({ from: '2026-06-01', to: '2026-06-30' }, 'u-ana');
    expect(stats.totalApprovedHours).toBe(5); // 300 minutes
    expect(stats.activeVolunteers).toBe(2);
  });

  it('builds the roster sorted by hours descending, tie-broken by name', async () => {
    const { service } = makeService([
      HOURS_ENTRY({ userId: 'u-bruno', user: { firstName: 'Bruno', lastName: 'Alves' }, minutes: 60 }),
      HOURS_ENTRY({ userId: 'u-ana', minutes: 120 }),
    ]);
    const stats = await service.getStatistics({ from: '2026-06-01', to: '2026-06-30' }, 'u-ana');
    expect(stats.roster.map((r) => r.userId)).toEqual(['u-ana', 'u-bruno']);
    expect(stats.roster[0].hours).toBe(2);
  });

  it('counts events with participation and splits emergency vs support per volunteer', async () => {
    const { service } = makeService(
      [],
      [
        CREW_MEMBER({ report: { id: 'r-1', type: 'EMERGENCY', occurredOn: new Date('2026-06-05T00:00:00.000Z') } }),
        CREW_MEMBER({ report: { id: 'r-2', type: 'LOCAL_SUPPORT', occurredOn: new Date('2026-06-06T00:00:00.000Z') } }),
      ],
    );
    const stats = await service.getStatistics({ from: '2026-06-01', to: '2026-06-30' }, 'u-ana');
    expect(stats.eventsWithParticipation).toBe(2);
    const [row] = stats.roster;
    expect(row).toMatchObject({ events: 2, emergencyEvents: 1, supportEvents: 1 });
  });

  it("scopes the viewer's own tile row and rank to the caller", async () => {
    const { service } = makeService([
      HOURS_ENTRY({ userId: 'u-ana', minutes: 240 }),
      HOURS_ENTRY({ userId: 'u-bruno', user: { firstName: 'Bruno', lastName: 'Alves' }, minutes: 60 }),
    ]);
    const stats = await service.getStatistics({ from: '2026-06-01', to: '2026-06-30' }, 'u-bruno');
    expect(stats.viewer).toMatchObject({ hours: 1, rank: 2, totalVolunteers: 2 });
  });

  it('gives a viewer with no hours or events in range a null rank rather than crashing', async () => {
    const { service } = makeService([HOURS_ENTRY({ userId: 'u-ana', minutes: 60 })]);
    const stats = await service.getStatistics({ from: '2026-06-01', to: '2026-06-30' }, 'u-carla');
    expect(stats.viewer).toMatchObject({ hours: 0, rank: null });
  });

  it('breaks hours down by activity type across the whole delegation', async () => {
    const { service } = makeService([
      HOURS_ENTRY({ activityType: 'EMERGENCY', minutes: 120 }),
      HOURS_ENTRY({ activityType: 'MEETING', minutes: 30 }),
    ]);
    const stats = await service.getStatistics({ from: '2026-06-01', to: '2026-06-30' }, 'u-ana');
    expect(stats.hoursByActivityType).toEqual(
      expect.arrayContaining([
        { activityType: 'EMERGENCY', hours: 2 },
        { activityType: 'MEETING', hours: 0.5 },
        { activityType: 'TRAINING', hours: 0 },
      ]),
    );
  });

  it('buckets monthly hours by the entry date', async () => {
    const { service } = makeService([
      HOURS_ENTRY({ date: new Date('2026-05-15T00:00:00.000Z'), minutes: 60 }),
      HOURS_ENTRY({ date: new Date('2026-06-15T00:00:00.000Z'), minutes: 120 }),
    ]);
    const stats = await service.getStatistics({ from: '2026-05-01', to: '2026-06-30' }, 'u-ana');
    expect(stats.monthlyHours).toEqual([
      { month: '2026-05', value: 1 },
      { month: '2026-06', value: 2 },
    ]);
  });
});
