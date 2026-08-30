import { PrismaClient } from '@prisma/client';
import { NoticeTargetType, NotificationChannel, UserRole } from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { NoticesService } from './notices.service';

/**
 * Integration coverage for #165 against a real Postgres. Delivery
 * (email/push) is a stub here on purpose — `NotificationDeliveryService` and
 * the channel senders have their own unit coverage; this suite is about what
 * only a real database proves: the schema round-trips, and target-role
 * filtering/receipt lifecycle work against real rows, not a fake Prisma.
 */
const describeIntegration = process.env.DATABASE_URL ? describe : describe.skip;

const RUN = `it-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const email = (local: string) => `${local}.${RUN}@notices.test`;

describeIntegration('Notices module (integration)', () => {
  const prisma = new PrismaClient() as unknown as PrismaService;
  const delivery = { scheduleForNotice: jest.fn().mockResolvedValue(undefined) };
  const notices = new NoticesService(prisma, delivery as never);

  let coordinator: { id: string };
  let operational: { id: string };
  let logistics: { id: string };
  let inactiveOperational: { id: string };
  const noticeIds: string[] = [];

  async function createUser(firstName: string, role: UserRole, isActive = true) {
    return prisma.user.create({
      data: { email: email(firstName.toLowerCase()), firstName, lastName: 'Test', role, isActive },
      select: { id: true },
    });
  }

  beforeAll(async () => {
    coordinator = await createUser('Coordinator', UserRole.EMERGENCY_COORDINATOR);
    operational = await createUser('Operational', UserRole.EMERGENCY_OPERATIONAL);
    logistics = await createUser('Logistics', UserRole.LOGISTICS_COORDINATOR);
    inactiveOperational = await createUser('Retired', UserRole.EMERGENCY_OPERATIONAL, false);
  });

  afterEach(async () => {
    if (noticeIds.length) {
      await prisma.notice.deleteMany({ where: { id: { in: noticeIds } } });
      noticeIds.length = 0;
    }
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [coordinator.id, operational.id, logistics.id, inactiveOperational.id] } },
    });
    await prisma.$disconnect();
  });

  it('targets every active user for ALL and excludes inactive ones', async () => {
    const notice = await notices.create(
      { id: coordinator.id, role: UserRole.EMERGENCY_COORDINATOR },
      {
        title: 'Base closed today',
        body: 'Roads flooded near the depot.',
        targetType: NoticeTargetType.ALL,
        channels: [],
      },
    );
    noticeIds.push(notice.id);

    const recipients = await notices.getRecipients(notice.id);
    const recipientIds = recipients.map((r) => r.userId);
    expect(recipientIds).toEqual(expect.arrayContaining([coordinator.id, operational.id, logistics.id]));
    expect(recipientIds).not.toContain(inactiveOperational.id);
  });

  it('restricts a ROLES notice to the chosen roles only', async () => {
    const notice = await notices.create(
      { id: coordinator.id, role: UserRole.EMERGENCY_COORDINATOR },
      {
        title: 'Logistics-only notice',
        body: 'Fuel delivery moved to Friday.',
        targetType: NoticeTargetType.ROLES,
        targetRoles: [UserRole.LOGISTICS_COORDINATOR],
        channels: [NotificationChannel.EMAIL],
      },
    );
    noticeIds.push(notice.id);

    const mine = await notices.listForMember({ id: logistics.id, role: UserRole.LOGISTICS_COORDINATOR });
    expect(mine.map((n) => n.id)).toContain(notice.id);

    const notMine = await notices.listForMember({ id: operational.id, role: UserRole.EMERGENCY_OPERATIONAL });
    expect(notMine.map((n) => n.id)).not.toContain(notice.id);
  });

  it('carries a member through read → acknowledge, visible to the coordinator', async () => {
    const notice = await notices.create(
      { id: coordinator.id, role: UserRole.EMERGENCY_COORDINATOR },
      { title: 'Read me', body: 'Please confirm.', targetType: NoticeTargetType.ALL, channels: [] },
    );
    noticeIds.push(notice.id);

    const beforeAck = await notices.listForMember({ id: operational.id, role: UserRole.EMERGENCY_OPERATIONAL });
    expect(beforeAck.find((n) => n.id === notice.id)?.receipt).toEqual({ readAt: null, acknowledgedAt: null });

    await notices.markRead(notice.id, operational.id);
    await notices.acknowledge(notice.id, operational.id);

    const recipients = await notices.getRecipients(notice.id);
    const mine = recipients.find((r) => r.userId === operational.id);
    expect(mine?.readAt).not.toBeNull();
    expect(mine?.acknowledgedAt).not.toBeNull();

    const stats = await notices.listForCoordinator();
    expect(stats.find((n) => n.id === notice.id)?.acknowledgedCount).toBeGreaterThanOrEqual(1);
  });

  it('deactivate expires the notice so it drops out of the member’s active list', async () => {
    const notice = await notices.create(
      { id: coordinator.id, role: UserRole.EMERGENCY_COORDINATOR },
      { title: 'Ends now', body: 'Superseded.', targetType: NoticeTargetType.ALL, channels: [] },
    );
    noticeIds.push(notice.id);

    await notices.deactivate(notice.id);

    const mine = await notices.listForMember({ id: operational.id, role: UserRole.EMERGENCY_OPERATIONAL });
    expect(mine.map((n) => n.id)).not.toContain(notice.id);
  });
});
