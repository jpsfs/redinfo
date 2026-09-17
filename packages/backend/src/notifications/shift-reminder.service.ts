import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Locale } from '@redinfo/shared';
import { NotificationType, ScheduleStatus } from '@redinfo/shared';
import { toIsoDate } from '../utils/date.util';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationDeliveryService } from './notification-delivery.service';
import { SHIFT_REMINDER_SCAN_QUEUE, SystemNotificationsQueueService } from './system-notifications-queue.service';
import { buildShiftReminderContent } from './templates/shift-reminder.templates';

const SCAN_INTERVAL_MS = 15 * 60 * 1000;
const REMINDER_LEAD_MS = 24 * 60 * 60 * 1000;

/** `null` and anything unrecognised both read as Portuguese — same fallback `detectLocale` uses on the frontend. */
function localeOf(locale: string | null): Locale {
  return locale === 'en' ? 'en' : 'pt';
}

/**
 * Every 15 minutes (`SystemNotificationsQueueService`), finds every published
 * shift starting in the next `[24h, 24h+15min)` window that hasn't had its
 * reminder sent yet, and enqueues one `SHIFT_REMINDER` notification per
 * assignee via `NotificationDeliveryService.scheduleSystemNotification`.
 *
 * Only covers windows with materialised `AvailabilityWindowShift` rows — a
 * legacy window that only ever had a pattern (see `ShiftScheduleService`) has
 * no shift row to read start/end minutes from, so its assignments are simply
 * skipped rather than reconstructing the pattern here too.
 */
@Injectable()
export class ShiftReminderService implements OnModuleInit {
  private readonly logger = new Logger(ShiftReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: SystemNotificationsQueueService,
    private readonly delivery: NotificationDeliveryService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.work(SHIFT_REMINDER_SCAN_QUEUE, () => this.scan());
  }

  async scan(): Promise<void> {
    const now = Date.now();
    const windowStart = new Date(now + REMINDER_LEAD_MS);
    const windowEnd = new Date(now + REMINDER_LEAD_MS + SCAN_INTERVAL_MS);

    const assignments = await this.prisma.scheduleAssignment.findMany({
      where: {
        reminderSentAt: null,
        date: { gte: dayStart(windowStart), lte: dayStart(windowEnd) },
        schedule: { status: ScheduleStatus.PUBLISHED },
      },
      select: {
        id: true,
        date: true,
        slot: true,
        user: { select: { id: true, firstName: true, locale: true, isActive: true } },
        role: { select: { name: true } },
        schedule: { select: { windowId: true } },
      },
    });
    if (assignments.length === 0) return;

    const shiftRows = await this.prisma.availabilityWindowShift.findMany({
      where: { windowId: { in: [...new Set(assignments.map((a) => a.schedule.windowId))] } },
      select: { windowId: true, date: true, slot: true, startMinute: true, endMinute: true },
    });
    const shiftByKey = new Map(shiftRows.map((s) => [`${s.windowId}#${toIsoDate(s.date)}#${s.slot}`, s]));

    for (const assignment of assignments) {
      if (!assignment.user.isActive) continue;

      const shift = shiftByKey.get(`${assignment.schedule.windowId}#${toIsoDate(assignment.date)}#${assignment.slot}`);
      if (!shift) continue;

      const shiftStart = new Date(assignment.date.getTime() + shift.startMinute * 60_000);
      if (shiftStart < windowStart || shiftStart >= windowEnd) continue;

      // Mark first: the reminder existing is what a later scan tick checks,
      // not whether the send itself later succeeds.
      await this.prisma.scheduleAssignment.update({
        where: { id: assignment.id },
        data: { reminderSentAt: new Date() },
      });

      try {
        await this.delivery.scheduleSystemNotification(
          NotificationType.SHIFT_REMINDER,
          assignment.user.id,
          buildShiftReminderContent(localeOf(assignment.user.locale), {
            firstName: assignment.user.firstName,
            date: assignment.date,
            startMinute: shift.startMinute,
            endMinute: shift.endMinute,
            roleName: assignment.role?.name ?? null,
          }),
        );
      } catch (cause) {
        this.logger.error(
          `Failed to schedule shift reminder for assignment ${assignment.id}: ${
            cause instanceof Error ? cause.message : cause
          }`,
        );
      }
    }
  }
}

/** UTC midnight of the given instant's day, to bound the `@db.Date` query. */
function dayStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
