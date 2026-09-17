import { NotificationType } from '@redinfo/shared';
import { BirthdayNotificationsService } from './birthday-notifications.service';

function buildPrisma() {
  return { user: { findMany: jest.fn().mockResolvedValue([]) } };
}

function makeService(prisma = buildPrisma()) {
  const queue = { work: jest.fn() };
  const delivery = { scheduleSystemNotification: jest.fn() };
  return {
    service: new BirthdayNotificationsService(prisma as never, queue as never, delivery as never),
    prisma,
    delivery,
  };
}

/** This year's birth date for `today`, so month/day match regardless of what year the fixture predates. */
function birthdayToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(1990, now.getUTCMonth(), now.getUTCDate()));
}

describe('BirthdayNotificationsService.scan', () => {
  it('greets the birthday person and announces it to every other active user', async () => {
    const prisma = buildPrisma();
    prisma.user.findMany.mockResolvedValue([
      { id: 'u1', firstName: 'Ana', locale: 'pt', birthDate: birthdayToday() },
      { id: 'u2', firstName: 'Bruno', locale: 'en', birthDate: null },
    ]);
    const { service, delivery } = makeService(prisma);

    await service.scan();

    expect(delivery.scheduleSystemNotification).toHaveBeenCalledWith(
      NotificationType.BIRTHDAY_GREETING,
      'u1',
      expect.objectContaining({ emailSubject: expect.stringContaining('Ana') }),
    );
    expect(delivery.scheduleSystemNotification).toHaveBeenCalledWith(
      NotificationType.BIRTHDAY_ANNOUNCEMENT,
      'u2',
      expect.objectContaining({ emailSubject: expect.stringContaining('Ana') }),
    );
    // Never announces someone's own birthday to themselves.
    expect(delivery.scheduleSystemNotification).not.toHaveBeenCalledWith(
      NotificationType.BIRTHDAY_ANNOUNCEMENT,
      'u1',
      expect.anything(),
    );
  });

  it('ignores a birth date on a different day', async () => {
    const notToday = new Date(Date.UTC(1990, 0, 1));
    const isJan1 = new Date().getUTCMonth() === 0 && new Date().getUTCDate() === 1;
    const prisma = buildPrisma();
    prisma.user.findMany.mockResolvedValue([{ id: 'u1', firstName: 'Ana', locale: 'pt', birthDate: notToday }]);
    const { service, delivery } = makeService(prisma);

    await service.scan();

    if (!isJan1) expect(delivery.scheduleSystemNotification).not.toHaveBeenCalled();
  });

  it('does nothing when no active user has a birthday today', async () => {
    const { service, delivery } = makeService();
    await service.scan();
    expect(delivery.scheduleSystemNotification).not.toHaveBeenCalled();
  });

  it('keeps scanning the rest of the team when one delivery fails', async () => {
    const prisma = buildPrisma();
    prisma.user.findMany.mockResolvedValue([
      { id: 'u1', firstName: 'Ana', locale: 'pt', birthDate: birthdayToday() },
      { id: 'u2', firstName: 'Bruno', locale: 'pt', birthDate: null },
    ]);
    const { service, delivery } = makeService(prisma);
    delivery.scheduleSystemNotification.mockRejectedValueOnce(new Error('boom'));

    await expect(service.scan()).resolves.toBeUndefined();
    expect(delivery.scheduleSystemNotification).toHaveBeenCalledTimes(2);
  });
});
