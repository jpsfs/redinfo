import { ForbiddenException } from '@nestjs/common';
import { NoticeTargetType, NotificationChannel, UserRole } from '@redinfo/shared';
import { NoticesService } from './notices.service';

const COORDINATOR = { id: 'u-coord', roles: [UserRole.EMERGENCY_COORDINATOR] };
const OPERATIONAL = { id: 'u-op', roles: [UserRole.EMERGENCY_OPERATIONAL] };

function buildPrisma() {
  return {
    notice: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    noticeReceipt: {
      createMany: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    notificationDelivery: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    user: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

function makeService(prisma = buildPrisma()) {
  const delivery = { scheduleForNotice: jest.fn().mockResolvedValue(undefined) };
  const service = new NoticesService(prisma as never, delivery as never);
  return { service, prisma, delivery };
}

const NOTICE_ROW = {
  id: 'n1',
  title: 'Storm warning',
  body: 'Roads closed near the base.',
  createdById: COORDINATOR.id,
  createdBy: { firstName: 'Ana', lastName: 'Silva' },
  targetType: NoticeTargetType.ALL,
  targetRoles: [] as { role: string }[],
  channels: [{ channel: NotificationChannel.EMAIL }],
  expiresAt: null as Date | null,
  createdAt: new Date('2026-08-29T09:00:00.000Z'),
  updatedAt: new Date('2026-08-29T09:00:00.000Z'),
};

describe('NoticesService.create', () => {
  it('targets every active user for an ALL notice and hands them to the delivery service', async () => {
    const { service, prisma, delivery } = makeService();
    prisma.notice.create.mockResolvedValue(NOTICE_ROW);
    prisma.user.findMany.mockResolvedValue([{ id: 'u-a' }, { id: 'u-b' }]);

    const result = await service.create(COORDINATOR, {
      title: NOTICE_ROW.title,
      body: NOTICE_ROW.body,
      targetType: NoticeTargetType.ALL,
      channels: [NotificationChannel.EMAIL],
    });

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      select: { id: true },
    });
    expect(prisma.noticeReceipt.createMany).toHaveBeenCalledWith({
      data: [
        { noticeId: 'n1', userId: 'u-a' },
        { noticeId: 'n1', userId: 'u-b' },
      ],
    });
    expect(delivery.scheduleForNotice).toHaveBeenCalledWith('n1', [NotificationChannel.EMAIL], ['u-a', 'u-b']);
    expect(result.createdByName).toBe('Ana Silva');
    expect(result.channels).toEqual([NotificationChannel.EMAIL]);
  });

  it('restricts recipients to the chosen roles for a ROLES notice', async () => {
    const { service, prisma } = makeService();
    prisma.notice.create.mockResolvedValue({
      ...NOTICE_ROW,
      targetType: NoticeTargetType.ROLES,
      targetRoles: [{ role: UserRole.LOGISTICS_COORDINATOR }],
    });
    prisma.user.findMany.mockResolvedValue([{ id: 'u-log' }]);

    await service.create(COORDINATOR, {
      title: NOTICE_ROW.title,
      body: NOTICE_ROW.body,
      targetType: NoticeTargetType.ROLES,
      targetRoles: [UserRole.LOGISTICS_COORDINATOR],
      channels: [],
    });

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { isActive: true, roles: { hasSome: [UserRole.LOGISTICS_COORDINATOR] } },
      select: { id: true },
    });
  });

  it('does not enqueue delivery when no channel beyond IN_APP was requested', async () => {
    const { service, prisma, delivery } = makeService();
    prisma.notice.create.mockResolvedValue({ ...NOTICE_ROW, channels: [] });
    prisma.user.findMany.mockResolvedValue([{ id: 'u-a' }]);

    await service.create(COORDINATOR, {
      title: NOTICE_ROW.title,
      body: NOTICE_ROW.body,
      targetType: NoticeTargetType.ALL,
      channels: [],
    });

    expect(delivery.scheduleForNotice).toHaveBeenCalledWith('n1', [], ['u-a']);
  });
});

describe('NoticesService receipts', () => {
  it('markRead refuses a caller who was never targeted', async () => {
    const { service, prisma } = makeService();
    prisma.noticeReceipt.findUnique.mockResolvedValue(null);

    await expect(service.markRead('n1', OPERATIONAL.id)).rejects.toThrow(ForbiddenException);
    expect(prisma.noticeReceipt.update).not.toHaveBeenCalled();
  });

  it('acknowledge stamps both readAt and acknowledgedAt for an existing receipt', async () => {
    const { service, prisma } = makeService();
    prisma.noticeReceipt.findUnique.mockResolvedValue({ id: 'r1', noticeId: 'n1', userId: OPERATIONAL.id });

    await service.acknowledge('n1', OPERATIONAL.id);

    expect(prisma.noticeReceipt.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { readAt: expect.any(Date), acknowledgedAt: expect.any(Date) },
    });
  });
});

describe('NoticesService.deactivate', () => {
  it('sets expiresAt to now for a still-active notice', async () => {
    const { service, prisma } = makeService();
    prisma.notice.findUnique.mockResolvedValue({ ...NOTICE_ROW, expiresAt: null });

    await service.deactivate('n1');

    expect(prisma.notice.update).toHaveBeenCalledWith({
      where: { id: 'n1' },
      data: { expiresAt: expect.any(Date) },
    });
  });

  it('is a no-op for a notice that has already expired', async () => {
    const { service, prisma } = makeService();
    prisma.notice.findUnique.mockResolvedValue({ ...NOTICE_ROW, expiresAt: new Date('2020-01-01') });

    await service.deactivate('n1');

    expect(prisma.notice.update).not.toHaveBeenCalled();
  });
});
