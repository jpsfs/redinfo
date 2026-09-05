import { NotificationChannel, NotificationDeliveryStatus, NotificationType } from '@redinfo/shared';
import { NotificationDeliveryService } from './notification-delivery.service';

function buildPrisma() {
  return {
    notice: { findUnique: jest.fn().mockResolvedValue({ title: 'Storm warning', body: 'Roads closed.' }) },
    notificationTypeSetting: { findMany: jest.fn().mockResolvedValue([]) },
    userNotificationPreference: { findMany: jest.fn().mockResolvedValue([]) },
    userNotificationTypeSetting: { findUnique: jest.fn().mockResolvedValue(null) },
    pushSubscription: { findMany: jest.fn().mockResolvedValue([]), delete: jest.fn().mockResolvedValue(undefined) },
    notificationDelivery: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
}

function makeService(prisma = buildPrisma()) {
  const queue = { enqueue: jest.fn(), work: jest.fn() };
  const email = { send: jest.fn() };
  const push = { send: jest.fn() };
  const service = new NotificationDeliveryService(prisma as never, queue as never, email as never, push as never);
  return { service, prisma, queue, email, push };
}

describe('NotificationDeliveryService.scheduleForNotice', () => {
  it('only enqueues channels the org has enabled for NOTICE', async () => {
    const prisma = buildPrisma();
    prisma.notificationTypeSetting.findMany.mockResolvedValue([
      { type: NotificationType.NOTICE, channel: NotificationChannel.EMAIL, enabled: true },
      { type: NotificationType.NOTICE, channel: NotificationChannel.WEB_PUSH, enabled: false },
    ]);
    prisma.notificationDelivery.create.mockResolvedValue({ id: 'd1' });
    const { service, queue } = makeService(prisma);

    await service.scheduleForNotice('n1', [NotificationChannel.EMAIL, NotificationChannel.WEB_PUSH], ['u1']);

    expect(prisma.notificationDelivery.create).toHaveBeenCalledTimes(1);
    expect(prisma.notificationDelivery.create).toHaveBeenCalledWith({
      data: {
        type: NotificationType.NOTICE,
        noticeId: 'n1',
        userId: 'u1',
        channel: NotificationChannel.EMAIL,
        emailSubject: 'Storm warning',
        emailBody: 'Roads closed.',
        pushTitle: 'Storm warning',
        pushBody: 'Roads closed.',
      },
    });
    expect(queue.enqueue).toHaveBeenCalledWith({ deliveryId: 'd1' });
  });

  it('does nothing when the notice is gone', async () => {
    const prisma = buildPrisma();
    prisma.notice.findUnique.mockResolvedValue(null);
    const { service } = makeService(prisma);

    await service.scheduleForNotice('n1', [NotificationChannel.EMAIL], ['u1']);

    expect(prisma.notificationDelivery.create).not.toHaveBeenCalled();
  });

  it('does nothing when no recipients or no channels are given', async () => {
    const { service, prisma, queue } = makeService();
    await service.scheduleForNotice('n1', [], ['u1']);
    await service.scheduleForNotice('n1', [NotificationChannel.EMAIL], []);
    expect(prisma.notificationDelivery.create).not.toHaveBeenCalled();
    expect(queue.enqueue).not.toHaveBeenCalled();
  });
});

describe('NotificationDeliveryService worker', () => {
  const DELIVERY = {
    id: 'd1',
    channel: NotificationChannel.EMAIL,
    userId: 'u1',
    emailSubject: 'Storm warning',
    emailBody: 'Roads closed.',
    pushTitle: 'Storm warning',
    pushBody: 'Roads closed.',
    user: { email: 'ana@example.com' },
  };

  /** Registers the worker via `onModuleInit`, then returns the handler `NotificationQueueService.work` captured. */
  async function deliverVia(setup: ReturnType<typeof makeService>, deliveryId: string) {
    await setup.service.onModuleInit();
    const handler = setup.queue.work.mock.calls[0][0] as (job: { deliveryId: string }) => Promise<void>;
    await handler({ deliveryId });
  }

  it('marks a successful email delivery SENT with the provider id', async () => {
    const prisma = buildPrisma();
    prisma.notificationDelivery.findUnique.mockResolvedValue(DELIVERY);
    const setup = makeService(prisma);
    setup.email.send.mockResolvedValue({ ok: true, providerMessageId: 'msg-1' });

    await deliverVia(setup, 'd1');

    expect(setup.email.send).toHaveBeenCalledWith('ana@example.com', 'Storm warning', 'Roads closed.');
    expect(prisma.notificationDelivery.update).toHaveBeenCalledWith({
      where: { id: 'd1' },
      data: { status: NotificationDeliveryStatus.SENT, error: null, providerMessageId: 'msg-1' },
    });
  });

  it('marks a failed send FAILED with the error, never throwing', async () => {
    const prisma = buildPrisma();
    prisma.notificationDelivery.findUnique.mockResolvedValue(DELIVERY);
    const setup = makeService(prisma);
    setup.email.send.mockResolvedValue({ ok: false, error: 'Domain not verified' });

    await deliverVia(setup, 'd1');

    expect(prisma.notificationDelivery.update).toHaveBeenCalledWith({
      where: { id: 'd1' },
      data: { status: NotificationDeliveryStatus.FAILED, error: 'Domain not verified', providerMessageId: null },
    });
  });

  it('prunes an expired push subscription and still counts a delivery to another device as sent', async () => {
    const prisma = buildPrisma();
    prisma.notificationDelivery.findUnique.mockResolvedValue({ ...DELIVERY, channel: NotificationChannel.WEB_PUSH });
    prisma.pushSubscription.findMany.mockResolvedValue([
      { id: 'sub-dead', endpoint: 'e1' },
      { id: 'sub-live', endpoint: 'e2' },
    ]);
    const setup = makeService(prisma);
    setup.push.send
      .mockResolvedValueOnce({ ok: false, error: 'Gone', expired: true })
      .mockResolvedValueOnce({ ok: true });

    await deliverVia(setup, 'd1');

    expect(prisma.pushSubscription.delete).toHaveBeenCalledWith({ where: { id: 'sub-dead' } });
    expect(prisma.notificationDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: NotificationDeliveryStatus.SENT }) }),
    );
  });

  it('does nothing when the delivery row is gone', async () => {
    const prisma = buildPrisma();
    prisma.notificationDelivery.findUnique.mockResolvedValue(null);
    const setup = makeService(prisma);

    await deliverVia(setup, 'missing');

    expect(setup.email.send).not.toHaveBeenCalled();
    expect(prisma.notificationDelivery.update).not.toHaveBeenCalled();
  });
});

describe('NotificationDeliveryService.scheduleSystemNotification', () => {
  const CONTENT = { emailSubject: 'Subj', emailBody: 'Body', pushTitle: 'Title', pushBody: 'Push body' };

  it('enqueues both channels when the type was never toggled and nothing is opted out', async () => {
    const prisma = buildPrisma();
    prisma.pushSubscription.findMany.mockResolvedValue([{ userId: 'u1' }]);
    prisma.notificationDelivery.create
      .mockResolvedValueOnce({ id: 'd-email' })
      .mockResolvedValueOnce({ id: 'd-push' });
    const { service, queue } = makeService(prisma);

    await service.scheduleSystemNotification(NotificationType.SHIFT_REMINDER, 'u1', CONTENT);

    expect(prisma.notificationDelivery.create).toHaveBeenNthCalledWith(1, {
      data: { type: NotificationType.SHIFT_REMINDER, userId: 'u1', channel: NotificationChannel.EMAIL, ...CONTENT },
    });
    expect(queue.enqueue).toHaveBeenCalledWith({ deliveryId: 'd-email' });
    expect(queue.enqueue).toHaveBeenCalledWith({ deliveryId: 'd-push' });
  });

  it('skips a type the member has explicitly turned off', async () => {
    const prisma = buildPrisma();
    prisma.userNotificationTypeSetting.findUnique.mockResolvedValue({ enabled: false });
    const { service, queue } = makeService(prisma);

    await service.scheduleSystemNotification(NotificationType.SHIFT_REMINDER, 'u1', CONTENT);

    expect(prisma.notificationDelivery.create).not.toHaveBeenCalled();
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('falls back to the system default when disabled by default and never toggled (BIRTHDAY_ANNOUNCEMENT)', async () => {
    const prisma = buildPrisma();
    const { service, queue } = makeService(prisma);

    await service.scheduleSystemNotification(NotificationType.BIRTHDAY_ANNOUNCEMENT, 'u1', CONTENT);

    expect(prisma.notificationDelivery.create).not.toHaveBeenCalled();
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it('honours an explicit opt-in override for a type disabled by default', async () => {
    const prisma = buildPrisma();
    prisma.userNotificationTypeSetting.findUnique.mockResolvedValue({ enabled: true });
    prisma.notificationDelivery.create.mockResolvedValue({ id: 'd1' });
    const { service, queue } = makeService(prisma);

    await service.scheduleSystemNotification(NotificationType.BIRTHDAY_ANNOUNCEMENT, 'u1', CONTENT);

    expect(queue.enqueue).toHaveBeenCalled();
  });

  it('drops WEB_PUSH for a user with no registered device, still sending EMAIL', async () => {
    const prisma = buildPrisma();
    prisma.notificationDelivery.create.mockResolvedValue({ id: 'd1' });
    const { service, queue } = makeService(prisma);

    await service.scheduleSystemNotification(NotificationType.SHIFT_REMINDER, 'u1', CONTENT);

    expect(prisma.notificationDelivery.create).toHaveBeenCalledTimes(1);
    expect(prisma.notificationDelivery.create).toHaveBeenCalledWith({
      data: { type: NotificationType.SHIFT_REMINDER, userId: 'u1', channel: NotificationChannel.EMAIL, ...CONTENT },
    });
    expect(queue.enqueue).toHaveBeenCalledTimes(1);
  });
});
