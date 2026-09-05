import { toMinuteOfDay } from '@redinfo/shared';
import { buildShiftReminderContent } from './shift-reminder.templates';

const CONTEXT = {
  firstName: 'Ana',
  date: new Date('2026-09-06T00:00:00.000Z'),
  startMinute: toMinuteOfDay(8),
  endMinute: toMinuteOfDay(16),
  roleName: null,
};

describe('buildShiftReminderContent', () => {
  it('renders Portuguese copy with the shift time range and the approved push wording', () => {
    const content = buildShiftReminderContent('pt', CONTEXT);
    expect(content.emailSubject).toBe('🚑 O teu turno é já amanhã!');
    expect(content.emailBody).toContain('08:00–16:00');
    expect(content.pushBody).toBe('6 de setembro, 08:00–16:00. Obrigado por estares disponível! 💪');
  });

  it('renders English copy', () => {
    const content = buildShiftReminderContent('en', CONTEXT);
    expect(content.emailSubject).toBe('🚑 Your shift is tomorrow!');
    expect(content.pushBody).toBe('6 September, 08:00–16:00. Thanks for being available! 💪');
  });

  it('mentions the role when one is assigned', () => {
    const content = buildShiftReminderContent('pt', { ...CONTEXT, roleName: 'Socorrista' });
    expect(content.emailBody).toContain('no papel de Socorrista');
  });
});
