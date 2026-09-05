import { NotificationChannel, NotificationType } from '@redinfo/shared';
import { NotificationsService } from './notifications.service';

function buildPrisma() {
  return {
    pushSubscription: { upsert: jest.fn(), deleteMany: jest.fn() },
    userNotificationPreference: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn() },
    userNotificationTypeSetting: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn() },
    notificationTypeSetting: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn() },
    $transaction: jest.fn(async (arg: unknown[]) => Promise.all(arg)),
  };
}

function makeService(prisma = buildPrisma()) {
  const webPush = { publicKey: 'vapid-public-key' };
  return { service: new NotificationsService(prisma as never, webPush as never), prisma, webPush };
}

describe('NotificationsService push subscriptions', () => {
  it('exposes the web push channel’s configured public key', () => {
    const { service } = makeService();
    expect(service.getPushPublicKey()).toEqual({ publicKey: 'vapid-public-key' });
  });

  it('upserts a subscription by endpoint so re-subscribing updates rather than duplicates', async () => {
    const { service, prisma } = makeService();
    await service.registerPushSubscription('u1', {
      endpoint: 'https://push.example/a',
      p256dh: 'key',
      auth: 'secret',
    });
    expect(prisma.pushSubscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { endpoint: 'https://push.example/a' } }),
    );
  });

  it('unregisters only the caller’s own subscription for that endpoint', async () => {
    const { service, prisma } = makeService();
    await service.unregisterPushSubscription('u1', 'https://push.example/a');
    expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1', endpoint: 'https://push.example/a' },
    });
  });
});

describe('NotificationsService preferences', () => {
  it('treats a channel with no stored row as enabled by default', async () => {
    const { service } = makeService();
    const prefs = await service.getMyPreferences('u1');
    expect(prefs).toEqual([
      { channel: NotificationChannel.EMAIL, enabled: true },
      { channel: NotificationChannel.WEB_PUSH, enabled: true },
    ]);
  });

  it('reflects a stored opt-out', async () => {
    const prisma = buildPrisma();
    prisma.userNotificationPreference.findMany.mockResolvedValue([
      { userId: 'u1', channel: NotificationChannel.WEB_PUSH, enabled: false },
    ]);
    const { service } = makeService(prisma);

    const prefs = await service.getMyPreferences('u1');

    expect(prefs).toContainEqual({ channel: NotificationChannel.WEB_PUSH, enabled: false });
    expect(prefs).toContainEqual({ channel: NotificationChannel.EMAIL, enabled: true });
  });
});

describe('NotificationsService per-member type preferences', () => {
  it('falls back to each type’s own system default when never toggled', async () => {
    const { service } = makeService();
    const prefs = await service.getMyTypePreferences('u1');
    expect(prefs).toEqual([
      { type: NotificationType.SHIFT_REMINDER, enabled: true },
      { type: NotificationType.BIRTHDAY_GREETING, enabled: true },
      { type: NotificationType.BIRTHDAY_ANNOUNCEMENT, enabled: false },
    ]);
  });

  it('reflects a stored override', async () => {
    const prisma = buildPrisma();
    prisma.userNotificationTypeSetting.findMany.mockResolvedValue([
      { userId: 'u1', type: NotificationType.BIRTHDAY_ANNOUNCEMENT, enabled: true },
    ]);
    const { service } = makeService(prisma);

    const prefs = await service.getMyTypePreferences('u1');

    expect(prefs).toContainEqual({ type: NotificationType.BIRTHDAY_ANNOUNCEMENT, enabled: true });
  });

  it('upserts one row per preference given', async () => {
    const { service, prisma } = makeService();
    await service.updateMyTypePreferences('u1', [{ type: NotificationType.SHIFT_REMINDER, enabled: false }]);

    expect(prisma.userNotificationTypeSetting.upsert).toHaveBeenCalledWith({
      where: { userId_type: { userId: 'u1', type: NotificationType.SHIFT_REMINDER } },
      create: { userId: 'u1', type: NotificationType.SHIFT_REMINDER, enabled: false },
      update: { enabled: false },
    });
  });
});

describe('NotificationsService org-wide type settings', () => {
  it('treats a channel with no stored row as disabled by default', async () => {
    const { service } = makeService();
    const settings = await service.getTypeSettings(NotificationType.NOTICE);
    expect(settings).toEqual([
      { channel: NotificationChannel.EMAIL, enabled: false },
      { channel: NotificationChannel.WEB_PUSH, enabled: false },
    ]);
  });

  it('enables exactly the given channels and disables the rest', async () => {
    const { service, prisma } = makeService();
    await service.updateTypeSettings(NotificationType.NOTICE, [NotificationChannel.EMAIL]);

    expect(prisma.notificationTypeSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { type_channel: { type: NotificationType.NOTICE, channel: NotificationChannel.EMAIL } },
        create: expect.objectContaining({ enabled: true }),
      }),
    );
    expect(prisma.notificationTypeSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { type_channel: { type: NotificationType.NOTICE, channel: NotificationChannel.WEB_PUSH } },
        create: expect.objectContaining({ enabled: false }),
      }),
    );
  });
});
