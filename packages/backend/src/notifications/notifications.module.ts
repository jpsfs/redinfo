import { Module } from '@nestjs/common';
import { AuditInterceptor } from '../auth/interceptors/audit.interceptor';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationQueueService } from './notification-queue.service';
import { NotificationDeliveryService } from './notification-delivery.service';
import { EmailChannelService } from './channels/email-channel.service';
import { WebPushChannelService } from './channels/web-push-channel.service';

/**
 * The generic notification-delivery framework: channels, the pg-boss-backed
 * queue, and org/user preferences. `NoticesModule` is its first consumer —
 * see the banner comment in `notification-delivery.service.ts`.
 */
@Module({
  providers: [
    NotificationsService,
    NotificationQueueService,
    NotificationDeliveryService,
    EmailChannelService,
    WebPushChannelService,
    AuditInterceptor,
  ],
  controllers: [NotificationsController],
  exports: [NotificationDeliveryService, NotificationsService],
})
export class NotificationsModule {}
