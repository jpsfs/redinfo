import { VolunteerHoursSummaryService } from './volunteer-hours-summary.service';

// ── Approved vs pending totals, per volunteer, per period (#164) ───────────────

const ENTRY = (overrides: Record<string, unknown> = {}) => ({
  userId: 'u-ana',
  user: { id: 'u-ana', firstName: 'Ana', lastName: 'Silva' },
  status: 'PENDING',
  activityType: 'EMERGENCY',
  minutes: 60,
  date: new Date('2026-10-10T00:00:00.000Z'),
  ...overrides,
});

function makeService(rows: Array<Record<string, unknown>>) {
  const prisma = { volunteerHoursEntry: { findMany: jest.fn().mockResolvedValue(rows) } };
  const volunteerHours = { refreshGeneration: jest.fn().mockResolvedValue(undefined) };
  return {
    service: new VolunteerHoursSummaryService(prisma as never, volunteerHours as never),
    prisma,
    volunteerHours,
  };
}

describe('getSummary', () => {
  it('refreshes generation before reading, so a never-viewed period still reports fully', async () => {
    const { service, volunteerHours } = makeService([]);
    await service.getSummary('2026-10-01', '2026-10-31');
    expect(volunteerHours.refreshGeneration).toHaveBeenCalledTimes(1);
  });

  it('splits approved and pending minutes per volunteer', async () => {
    const { service } = makeService([
      ENTRY({ status: 'APPROVED', minutes: 240 }),
      ENTRY({ status: 'PENDING', minutes: 60 }),
    ]);

    const summary = await service.getSummary('2026-10-01', '2026-10-31');

    expect(summary.rows).toEqual([
      expect.objectContaining({ userId: 'u-ana', approvedMinutes: 240, pendingMinutes: 60 }),
    ]);
  });

  it('breaks down approved minutes by activity type, ignoring pending', async () => {
    const { service } = makeService([
      ENTRY({ status: 'APPROVED', activityType: 'EMERGENCY', minutes: 120 }),
      ENTRY({ status: 'APPROVED', activityType: 'MEETING', minutes: 30 }),
      ENTRY({ status: 'PENDING', activityType: 'TRAINING', minutes: 999 }),
    ]);

    const [row] = (await service.getSummary('2026-10-01', '2026-10-31')).rows;

    expect(row.byActivityType).toEqual({ EMERGENCY: 120, MEETING: 30 });
  });

  it('keeps one row per volunteer, sorted by last name then first name', async () => {
    const { service } = makeService([
      ENTRY({ userId: 'u-bruno', user: { id: 'u-bruno', firstName: 'Bruno', lastName: 'Alves' } }),
      ENTRY({ userId: 'u-ana', user: { id: 'u-ana', firstName: 'Ana', lastName: 'Silva' } }),
    ]);

    const { rows } = await service.getSummary('2026-10-01', '2026-10-31');

    expect(rows.map((r) => r.userId)).toEqual(['u-bruno', 'u-ana']);
  });
});

describe('getCsv', () => {
  it('emits one column per activity type plus the two totals', async () => {
    const { service } = makeService([ENTRY({ status: 'APPROVED', activityType: 'MEETING', minutes: 90 })]);
    const csv = await service.getCsv('2026-10-01', '2026-10-31');
    const [header, row] = csv.split('\n');

    expect(header).toMatch(/^firstName,lastName,approvedMinutes,pendingMinutes,/);
    expect(row).toMatch(/^Ana,Silva,90,0,/);
  });
});
