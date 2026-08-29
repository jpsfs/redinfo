import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  NotificationChannel,
  NotificationDeliveryStatus,
  NotificationType,
  resolveEffectiveNotificationChannels,
} from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationQueueService } from './notification-queue.service';
import { EmailChannelService } from './channels/email-channel.service';
import { WebPushChannelService } from './channels/web-push-channel.service';
import { ChannelSendResult } from './channels/channel.types';

/**
 * Resolves who actually gets a notice on which channels, then enqueues and
 * carries out the send. `IN_APP` never passes through here — the `Notice`
 * and `NoticeReceipt` rows existing already are the in-app delivery.
 */
@Injectable()
export class NotificationDeliveryService implements OnModuleInit {
  private readonly logger = new Logger(NotificationDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: NotificationQueueService,
    private readonly email: EmailChannelService,
    private readonly push: WebPushChannelService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.work((job) => this.deliver(job.deliveryId));
  }

  /**
   * Called once, right after a notice and its `NoticeReceipt` rows are
   * created. `requestedChannels` excludes `IN_APP` by construction (see
   * `NoticesService`) — only `EMAIL`/`WEB_PUSH` ever reach here.
   */
  async scheduleForNotice(
    noticeId: string,
    requestedChannels: NotificationChannel[],
    recipientIds: string[],
  ): Promise<void> {
    if (requestedChannels.length === 0 || recipientIds.length === 0) return;

    const typeSettings = await this.prisma.notificationTypeSetting.findMany({
      where: { type: NotificationType.NOTICE },
    });
    const typeDefaultChannels = typeSettings
      .filter((setting) => setting.enabled)
      .map((setting) => setting.channel as NotificationChannel);

    const [prefs, subs] = await Promise.all([
      this.prisma.userNotificationPreference.findMany({ where: { userId: { in: recipientIds } } }),
      this.prisma.pushSubscription.findMany({
        where: { userId: { in: recipientIds } },
        select: { userId: true },
      }),
    ]);
    const usersWithPush = new Set(subs.map((sub) => sub.userId));

    for (const userId of recipientIds) {
      const userDisabledChannels = prefs
        .filter((pref) => pref.userId === userId && !pref.enabled)
        .map((pref) => pref.channel as NotificationChannel);

      const effective = resolveEffectiveNotificationChannels({
        requestedChannels,
        typeDefaultChannels,
        userDisabledChannels,
        userHasPushSubscription: usersWithPush.has(userId),
      });

      for (const channel of effective) {
        const delivery = await this.prisma.notificationDelivery.create({
          data: { noticeId, userId, channel },
        });
        await this.queue.enqueue({ deliveryId: delivery.id });
      }
    }
  }

  private async deliver(deliveryId: string): Promise<void> {
    const delivery = await this.prisma.notificationDelivery.findUnique({
      where: { id: deliveryId },
      include: { notice: true, user: true },
    });
    if (!delivery) return;

    const result =
      delivery.channel === NotificationChannel.EMAIL
        ? await this.email.send(delivery.user.email, delivery.notice.title, delivery.notice.body)
        : await this.sendPush(delivery.userId, delivery.notice.title, delivery.notice.body);

    if (!result.ok) {
      this.logger.warn(
        `${delivery.channel} delivery ${deliveryId} to ${delivery.userId} failed: ${result.error}`,
      );
    }

    await this.prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: {
        status: result.ok ? NotificationDeliveryStatus.SENT : NotificationDeliveryStatus.FAILED,
        error: result.error ?? null,
        providerMessageId: result.providerMessageId ?? null,
      },
    });
  }

  /** Fans out to every device the user has registered; one live device is enough to count as sent. */
  private async sendPush(userId: string, title: string, body: string): Promise<ChannelSendResult> {
    const subscriptions = await this.prisma.pushSubscription.findMany({ where: { userId } });
    if (subscriptions.length === 0) return { ok: false, error: 'No push subscription registered' };

    const errors: string[] = [];
    let delivered = false;
    for (const subscription of subscriptions) {
      const result = await this.push.send(subscription, title, body);
      if (result.ok) {
        delivered = true;
        continue;
      }
      if (result.expired) {
        await this.prisma.pushSubscription.delete({ where: { id: subscription.id } }).catch(() => undefined);
      }
      errors.push(result.error ?? 'Unknown push error');
    }
    return delivered ? { ok: true } : { ok: false, error: errors.join('; ') };
  }
}
