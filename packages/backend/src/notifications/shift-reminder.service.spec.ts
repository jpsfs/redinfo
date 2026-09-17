import { NotificationType, toMinuteOfDay } from '@redinfo/shared';
import { ShiftReminderService } from './shift-reminder.service';

function buildPrisma() {
  return {
    scheduleAssignment: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
    availabilityWindowShift: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

function makeService(prisma = buildPrisma()) {
  const queue = { work: jest.fn() };
  const delivery = { scheduleSystemNotification: jest.fn() };
  return { service: new ShiftReminderService(prisma as never, queue as never, delivery as never), prisma, delivery };
}

/** 24h + 5min from now — comfortably inside the `[24h, 24h+15min)` scan window regardless of test run time. */
function shiftStartingSoon(): Date {
  return new Date(Date.now() + 24 * 60 * 60 * 1000 + 5 * 60 * 1000);
}

describe('ShiftReminderService.scan', () => {
  const ASSIGNMENT = {
    id: 'a1',
    date: new Date(0),
    slot: 1,
    user: { id: 'u1', firstName: 'Ana', locale: 'pt', isActive: true },
    role: { name: 'Socorrista' },
    schedule: { windowId: 'w1' },
  };

  it('sends a reminder for an assignment whose shift starts in the next 24h window and marks it sent', async () => {
    const start = shiftStartingSoon();
    const dayStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
    const startMinute = Math.round((start.getTime() - dayStart.getTime()) / 60_000);

    const prisma = buildPrisma();
    prisma.scheduleAssignment.findMany.mockResolvedValue([{ ...ASSIGNMENT, date: dayStart }]);
    prisma.availabilityWindowShift.findMany.mockResolvedValue([
      { windowId: 'w1', date: dayStart, slot: 1, startMinute, endMinute: startMinute + toMinuteOfDay(8) },
    ]);
    const { service, prisma: p, delivery } = makeService(prisma);

    await service.scan();

    expect(p.scheduleAssignment.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: { reminderSentAt: expect.any(Date) },
    });
    expect(delivery.scheduleSystemNotification).toHaveBeenCalledWith(
      NotificationType.SHIFT_REMINDER,
      'u1',
      expect.objectContaining({ pushBody: expect.stringContaining('Obrigado') }),
    );
  });

  it('skips an assignment whose shift starts outside the 24h window', async () => {
    const farAway = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const dayStart = new Date(Date.UTC(farAway.getUTCFullYear(), farAway.getUTCMonth(), farAway.getUTCDate()));

    const prisma = buildPrisma();
    prisma.scheduleAssignment.findMany.mockResolvedValue([{ ...ASSIGNMENT, date: dayStart }]);
    prisma.availabilityWindowShift.findMany.mockResolvedValue([
      { windowId: 'w1', date: dayStart, slot: 1, startMinute: 0, endMinute: 60 },
    ]);
    const { service, prisma: p, delivery } = makeService(prisma);

    await service.scan();

    expect(p.scheduleAssignment.update).not.toHaveBeenCalled();
    expect(delivery.scheduleSystemNotification).not.toHaveBeenCalled();
  });

  it('skips a legacy assignment with no materialised shift row', async () => {
    const prisma = buildPrisma();
    prisma.scheduleAssignment.findMany.mockResolvedValue([ASSIGNMENT]);
    prisma.availabilityWindowShift.findMany.mockResolvedValue([]);
    const { service, prisma: p, delivery } = makeService(prisma);

    await service.scan();

    expect(p.scheduleAssignment.update).not.toHaveBeenCalled();
    expect(delivery.scheduleSystemNotification).not.toHaveBeenCalled();
  });

  it('skips an inactive user even if their shift is in the window', async () => {
    const start = shiftStartingSoon();
    const dayStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
    const startMinute = Math.round((start.getTime() - dayStart.getTime()) / 60_000);

    const prisma = buildPrisma();
    prisma.scheduleAssignment.findMany.mockResolvedValue([
      { ...ASSIGNMENT, date: dayStart, user: { ...ASSIGNMENT.user, isActive: false } },
    ]);
    prisma.availabilityWindowShift.findMany.mockResolvedValue([
      { windowId: 'w1', date: dayStart, slot: 1, startMinute, endMinute: startMinute + 60 },
    ]);
    const { service, delivery } = makeService(prisma);

    await service.scan();

    expect(delivery.scheduleSystemNotification).not.toHaveBeenCalled();
  });

  it('does nothing when there are no unreminded assignments in range', async () => {
    const { service, prisma } = makeService();
    await service.scan();
    expect(prisma.availabilityWindowShift.findMany).not.toHaveBeenCalled();
  });
});
