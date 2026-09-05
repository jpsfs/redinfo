import type { Locale } from '@redinfo/shared';
import type { SystemNotificationContent } from '../notification-delivery.service';

/** Sent to the birthday person themselves. */
export function buildBirthdayGreetingContent(locale: Locale, firstName: string): SystemNotificationContent {
  if (locale === 'pt') {
    return {
      emailSubject: `🎂 Feliz aniversário, ${firstName}!`,
      emailBody: 'Toda a equipa te deseja um dia fantástico. Obrigado por tudo o que fazes por quem precisa. 🎉',
      pushTitle: '🎂 Feliz aniversário!',
      pushBody: `Toda a equipa te deseja um dia fantástico, ${firstName}! 🎉`,
    };
  }
  return {
    emailSubject: `🎂 Happy birthday, ${firstName}!`,
    emailBody: 'The whole team wishes you a great day. Thank you for everything you do. 🎉',
    pushTitle: '🎂 Happy birthday!',
    pushBody: `The whole team wishes you a great day, ${firstName}! 🎉`,
  };
}

/** Sent to everyone else, telling them it's a teammate's birthday today. */
export function buildBirthdayAnnouncementContent(locale: Locale, firstName: string): SystemNotificationContent {
  if (locale === 'pt') {
    return {
      emailSubject: `🎂 Hoje é o aniversário de ${firstName}!`,
      emailBody: `Aproveita para lhe dares os parabéns! 🎉`,
      pushTitle: '🎂 Aniversário de hoje',
      pushBody: `Hoje é o aniversário de ${firstName}! 🎉`,
    };
  }
  return {
    emailSubject: `🎂 It's ${firstName}'s birthday today!`,
    emailBody: `Might be a good day to wish them well. 🎉`,
    pushTitle: "🎂 Today's birthday",
    pushBody: `It's ${firstName}'s birthday today! 🎉`,
  };
}
