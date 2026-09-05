import type { Locale } from '@redinfo/shared';
import { formatShiftLabel } from '@redinfo/shared';
import type { SystemNotificationContent } from '../notification-delivery.service';

export interface ShiftReminderContext {
  firstName: string;
  /** The shift's calendar date, at UTC midnight (as `@db.Date` round-trips). */
  date: Date;
  startMinute: number;
  endMinute: number;
  /** Null when the window defines no roles at all. */
  roleName: string | null;
}

function formatDate(locale: Locale, date: Date): string {
  return new Intl.DateTimeFormat(locale === 'pt' ? 'pt-PT' : 'en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
  }).format(date);
}

/** 24h-ahead reminder, sent to everyone assigned to a shift — short, warm, one per recipient's own locale. */
export function buildShiftReminderContent(locale: Locale, ctx: ShiftReminderContext): SystemNotificationContent {
  const date = formatDate(locale, ctx.date);
  const time = formatShiftLabel(ctx);
  const role = ctx.roleName;

  if (locale === 'pt') {
    return {
      emailSubject: '🚑 O teu turno é já amanhã!',
      emailBody:
        `Olá ${ctx.firstName}, só para lembrar: tens turno amanhã, dia ${date}, das ${time}` +
        `${role ? `, no papel de ${role}` : ''}. Obrigado por estares sempre pronto/a a ajudar quem precisa` +
        ` — a tua dedicação faz a diferença. 💪 Bom turno!`,
      pushTitle: '🚑 Turno amanhã',
      pushBody: `${date}, ${time}. Obrigado por estares disponível! 💪`,
    };
  }

  return {
    emailSubject: '🚑 Your shift is tomorrow!',
    emailBody:
      `Hi ${ctx.firstName}, quick reminder: you're on shift tomorrow, ${date}, ${time}` +
      `${role ? `, as ${role}` : ''}. Thank you for always being ready to help — it makes a real difference. ` +
      `💪 Have a great shift!`,
    pushTitle: '🚑 Shift tomorrow',
    pushBody: `${date}, ${time}. Thanks for being available! 💪`,
  };
}
