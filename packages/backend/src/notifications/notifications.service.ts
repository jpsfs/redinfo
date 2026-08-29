import { Injectable } from '@nestjs/common';
import { NotificationChannel, NotificationType, UserNotificationPreference } from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterPushSubscriptionDto } from './dto/register-push-subscription.dto';
import { WebPushChannelService } from './channels/web-push-channel.service';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly webPush: WebPushChannelService,
  ) {}

  /** Null until `VAPID_PUBLIC_KEY` is configured — the frontend disables the subscribe button until then. */
  getPushPublicKey(): { publicKey: string | null } {
    return { publicKey: this.webPush.publicKey };
  }

  /** Upsert on `endpoint`: re-subscribing the same browser updates its keys rather than duplicating the row. */
  async registerPushSubscription(userId: string, dto: RegisterPushSubscriptionDto): Promise<void> {
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      create: { userId, endpoint: dto.endpoint, p256dh: dto.p256dh, auth: dto.auth, userAgent: dto.userAgent },
      update: { userId, p256dh: dto.p256dh, auth: dto.auth, userAgent: dto.userAgent },
    });
  }

  async unregisterPushSubscription(userId: string, endpoint: string): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
  }

  /** A member's own opt-outs. Channels with no row are treated as enabled (the default). */
  async getMyPreferences(userId: string): Promise<UserNotificationPreference[]> {
    const rows = await this.prisma.userNotificationPreference.findMany({ where: { userId } });
    const byChannel = new Map(rows.map((row) => [row.channel, row.enabled]));
    return [NotificationChannel.EMAIL, NotificationChannel.WEB_PUSH].map((channel) => ({
      channel,
      enabled: byChannel.get(channel) ?? true,
    }));
  }

  async updateMyPreferences(
    userId: string,
    preferences: { channel: NotificationChannel; enabled: boolean }[],
  ): Promise<void> {
    await this.prisma.$transaction(
      preferences.map((pref) =>
        this.prisma.userNotificationPreference.upsert({
          where: { userId_channel: { userId, channel: pref.channel } },
          create: { userId, channel: pref.channel, enabled: pref.enabled },
          update: { enabled: pref.enabled },
        }),
      ),
    );
  }

  /** Org-wide defaults for one notification type. A channel with no row is treated as disabled. */
  async getTypeSettings(type: NotificationType): Promise<{ channel: NotificationChannel; enabled: boolean }[]> {
    const rows = await this.prisma.notificationTypeSetting.findMany({ where: { type } });
    const byChannel = new Map(rows.map((row) => [row.channel, row.enabled]));
    return [NotificationChannel.EMAIL, NotificationChannel.WEB_PUSH].map((channel) => ({
      channel,
      enabled: byChannel.get(channel) ?? false,
    }));
  }

  /** Replaces the type's config: exactly the given channels end up enabled, everything else disabled. */
  async updateTypeSettings(type: NotificationType, enabledChannels: NotificationChannel[]): Promise<void> {
    const enabled = new Set(enabledChannels);
    await this.prisma.$transaction(
      [NotificationChannel.EMAIL, NotificationChannel.WEB_PUSH].map((channel) =>
        this.prisma.notificationTypeSetting.upsert({
          where: { type_channel: { type, channel } },
          create: { type, channel, enabled: enabled.has(channel) },
          update: { enabled: enabled.has(channel) },
        }),
      ),
    );
  }
}
