import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Locale } from '@redinfo/shared';
import { isBirthdayOn, NotificationType } from '@redinfo/shared';
import { toIsoDate } from '../utils/date.util';
import { today } from '../users/certifications.util';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationDeliveryService } from './notification-delivery.service';
import { BIRTHDAY_SCAN_QUEUE, SystemNotificationsQueueService } from './system-notifications-queue.service';
import { buildBirthdayAnnouncementContent, buildBirthdayGreetingContent } from './templates/birthday.templates';

/** `null` and anything unrecognised both read as Portuguese — same fallback `detectLocale` uses on the frontend. */
function localeOf(locale: string | null): Locale {
  return locale === 'en' ? 'en' : 'pt';
}

/**
 * Once a day (`SystemNotificationsQueueService`), finds every active user
 * whose birthday is today — same `isBirthdayOn` rule `UsersService.birthdaysToday`
 * uses for the dashboard widget, so a Feb 29 birthday lands on the same day in
 * both places — and sends two kinds of notification: a `BIRTHDAY_GREETING` to
 * the person themselves, and a `BIRTHDAY_ANNOUNCEMENT` to every other active
 * user telling them it's a teammate's birthday. Each is its own
 * `NotificationType` with its own default (see `NOTIFICATION_TYPE_DEFAULT_ENABLED`)
 * precisely so a member can want one without the other.
 */
@Injectable()
export class BirthdayNotificationsService implements OnModuleInit {
  private readonly logger = new Logger(BirthdayNotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: SystemNotificationsQueueService,
    private readonly delivery: NotificationDeliveryService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.work(BIRTHDAY_SCAN_QUEUE, () => this.scan());
  }

  async scan(): Promise<void> {
    const onDate = today();
    const activeUsers = await this.prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, firstName: true, locale: true, birthDate: true },
    });
    const birthdayPeople = activeUsers.filter(
      (user) => user.birthDate && isBirthdayOn(toIsoDate(user.birthDate), onDate),
    );
    if (birthdayPeople.length === 0) return;

    for (const person of birthdayPeople) {
      await this.notify(
        NotificationType.BIRTHDAY_GREETING,
        person.id,
        buildBirthdayGreetingContent(localeOf(person.locale), person.firstName),
      );

      for (const other of activeUsers) {
        if (other.id === person.id) continue;
        await this.notify(
          NotificationType.BIRTHDAY_ANNOUNCEMENT,
          other.id,
          buildBirthdayAnnouncementContent(localeOf(other.locale), person.firstName),
        );
      }
    }
  }

  private async notify(
    type: NotificationType,
    userId: string,
    content: Parameters<NotificationDeliveryService['scheduleSystemNotification']>[2],
  ): Promise<void> {
    try {
      await this.delivery.scheduleSystemNotification(type, userId, content);
    } catch (cause) {
      this.logger.error(
        `Failed to schedule ${type} for ${userId}: ${cause instanceof Error ? cause.message : cause}`,
      );
    }
  }
}
