import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  Notice as NoticeShape,
  NoticeRecipientStatus,
  NoticeTargetType,
  NoticeWithReceipt,
  NoticeWithStats,
  NotificationChannel,
  NotificationDeliveryStatus,
  UserRole,
} from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationDeliveryService } from '../notifications/notification-delivery.service';
import { CreateNoticeDto } from './dto/create-notice.dto';

export interface RequestUser {
  id: string;
  role: UserRole;
}

const NOTICE_INCLUDE = {
  createdBy: { select: { firstName: true, lastName: true } },
  targetRoles: true,
  channels: true,
} as const;

@Injectable()
export class NoticesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly delivery: NotificationDeliveryService,
  ) {}

  async create(actor: RequestUser, dto: CreateNoticeDto): Promise<NoticeShape> {
    const notice = await this.prisma.notice.create({
      data: {
        title: dto.title,
        body: dto.body,
        createdById: actor.id,
        targetType: dto.targetType,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        targetRoles:
          dto.targetType === NoticeTargetType.ROLES
            ? { create: (dto.targetRoles ?? []).map((role) => ({ role })) }
            : undefined,
        channels: { create: dto.channels.map((channel) => ({ channel })) },
      },
      include: NOTICE_INCLUDE,
    });

    const recipientIds = await this.resolveRecipientIds(dto.targetType, dto.targetRoles);
    if (recipientIds.length > 0) {
      await this.prisma.noticeReceipt.createMany({
        data: recipientIds.map((userId) => ({ noticeId: notice.id, userId })),
      });
    }
    // Fire-and-forget from the caller's point of view: the notice is already
    // saved and visible in-app: an email/push failure must never undo that.
    void this.delivery.scheduleForNotice(notice.id, dto.channels, recipientIds);

    return this.toNoticeShape(notice);
  }

  /** Active notices targeted at this member, each with their own receipt. */
  async listForMember(user: RequestUser): Promise<NoticeWithReceipt[]> {
    const rows = await this.prisma.notice.findMany({
      where: {
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        AND: [
          {
            OR: [
              { targetType: NoticeTargetType.ALL },
              { targetType: NoticeTargetType.ROLES, targetRoles: { some: { role: user.role } } },
            ],
          },
        ],
      },
      include: {
        ...NOTICE_INCLUDE,
        receipts: { where: { userId: user.id } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((row) => ({
      ...this.toNoticeShape(row),
      receipt: {
        readAt: row.receipts[0]?.readAt?.toISOString() ?? null,
        acknowledgedAt: row.receipts[0]?.acknowledgedAt?.toISOString() ?? null,
      },
    }));
  }

  /** The full history, newest first, for the coordinator's notices screen. */
  async listForCoordinator(): Promise<NoticeWithStats[]> {
    const rows = await this.prisma.notice.findMany({
      include: {
        ...NOTICE_INCLUDE,
        _count: { select: { receipts: true } },
        receipts: { where: { acknowledgedAt: { not: null } }, select: { id: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => ({
      ...this.toNoticeShape(row),
      recipientCount: row._count.receipts,
      acknowledgedCount: row.receipts.length,
    }));
  }

  async getRecipients(noticeId: string): Promise<NoticeRecipientStatus[]> {
    await this.findOneOrThrow(noticeId);
    const receipts = await this.prisma.noticeReceipt.findMany({
      where: { noticeId },
      include: {
        user: { select: { firstName: true, lastName: true } },
      },
    });
    const deliveries = await this.prisma.notificationDelivery.findMany({ where: { noticeId } });

    return receipts.map((receipt) => ({
      userId: receipt.userId,
      userName: `${receipt.user.firstName} ${receipt.user.lastName}`,
      readAt: receipt.readAt?.toISOString() ?? null,
      acknowledgedAt: receipt.acknowledgedAt?.toISOString() ?? null,
      deliveries: deliveries
        .filter((row) => row.userId === receipt.userId)
        .map((row) => ({
          channel: row.channel as NotificationChannel,
          status: row.status as NotificationDeliveryStatus,
          error: row.error,
        })),
    }));
  }

  async markRead(noticeId: string, userId: string): Promise<void> {
    await this.upsertReceipt(noticeId, userId, { readAt: new Date() });
  }

  async acknowledge(noticeId: string, userId: string): Promise<void> {
    await this.upsertReceipt(noticeId, userId, { readAt: new Date(), acknowledgedAt: new Date() });
  }

  /** Ends the notice early — the coordinator equivalent of letting `expiresAt` pass. */
  async deactivate(noticeId: string): Promise<void> {
    const notice = await this.findOneOrThrow(noticeId);
    if (notice.expiresAt && notice.expiresAt <= new Date()) return; // already inactive
    await this.prisma.notice.update({ where: { id: noticeId }, data: { expiresAt: new Date() } });
  }

  private async upsertReceipt(
    noticeId: string,
    userId: string,
    data: { readAt: Date; acknowledgedAt?: Date },
  ): Promise<void> {
    const receipt = await this.prisma.noticeReceipt.findUnique({
      where: { noticeId_userId: { noticeId, userId } },
    });
    if (!receipt) {
      // Acknowledging a notice the caller was never targeted for — e.g. their
      // role changed after it was sent — is refused rather than silently
      // creating a receipt for something they were never sent.
      throw new ForbiddenException('Not a recipient of this notice');
    }
    await this.prisma.noticeReceipt.update({ where: { id: receipt.id }, data });
  }

  private async resolveRecipientIds(targetType: NoticeTargetType, targetRoles?: UserRole[]): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        ...(targetType === NoticeTargetType.ROLES ? { role: { in: targetRoles ?? [] } } : {}),
      },
      select: { id: true },
    });
    return users.map((user) => user.id);
  }

  private async findOneOrThrow(noticeId: string) {
    const notice = await this.prisma.notice.findUnique({ where: { id: noticeId } });
    if (!notice) throw new NotFoundException('Notice not found');
    return notice;
  }

  // Prisma's generated enums are structurally identical to `@redinfo/shared`'s
  // but not the same type, so every enum field here is cast at the boundary —
  // same pattern as `schedules.service.ts`'s `row.status as ScheduleStatus`.
  private toNoticeShape(row: {
    id: string;
    title: string;
    body: string;
    createdById: string;
    createdBy: { firstName: string; lastName: string };
    targetType: string;
    targetRoles: { role: string }[];
    channels: { channel: string }[];
    expiresAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): NoticeShape {
    return {
      id: row.id,
      title: row.title,
      body: row.body,
      createdById: row.createdById,
      createdByName: `${row.createdBy.firstName} ${row.createdBy.lastName}`,
      targetType: row.targetType as NoticeTargetType,
      targetRoles: row.targetRoles.map((entry) => entry.role as UserRole),
      channels: row.channels.map((entry) => entry.channel as NotificationChannel),
      expiresAt: row.expiresAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
