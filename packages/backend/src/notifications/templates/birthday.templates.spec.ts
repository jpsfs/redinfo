import { buildBirthdayAnnouncementContent, buildBirthdayGreetingContent } from './birthday.templates';

describe('buildBirthdayGreetingContent', () => {
  it('renders Portuguese copy addressed to the birthday person', () => {
    const content = buildBirthdayGreetingContent('pt', 'Ana');
    expect(content.emailSubject).toBe('🎂 Feliz aniversário, Ana!');
    expect(content.pushBody).toContain('Ana');
  });

  it('renders English copy', () => {
    const content = buildBirthdayGreetingContent('en', 'Ana');
    expect(content.emailSubject).toBe('🎂 Happy birthday, Ana!');
  });
});

describe('buildBirthdayAnnouncementContent', () => {
  it('names the birthday person for the rest of the team, in Portuguese', () => {
    const content = buildBirthdayAnnouncementContent('pt', 'Ana');
    expect(content.emailSubject).toBe('🎂 Hoje é o aniversário de Ana!');
    expect(content.pushBody).toContain('Ana');
  });

  it('renders English copy', () => {
    const content = buildBirthdayAnnouncementContent('en', 'Ana');
    expect(content.emailSubject).toBe("🎂 It's Ana's birthday today!");
  });
});
