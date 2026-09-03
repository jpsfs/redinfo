import { extractOtpCode, INEM_OTP_SENDER, MailSummary, parseOwaDisplayDate, selectOtpMessage } from './otp-mail';

describe('extractOtpCode', () => {
  it('extracts the 6-digit code from the confirmed subject format', () => {
    expect(extractOtpCode('Token code: 482913')).toBe('482913');
  });

  it('returns null for a subject with no code', () => {
    expect(extractOtpCode('Your INEM account')).toBeNull();
  });

  it('does not match a code shorter or longer than 6 digits', () => {
    expect(extractOtpCode('Token code: 1234')).toBeNull();
    expect(extractOtpCode('Token code: 12345678')).toBeNull();
  });
});

describe('selectOtpMessage', () => {
  const SINCE = '2026-09-02T10:00:00.000Z';

  it('picks a message from the confirmed sender that arrived after the login attempt started', () => {
    const messages = [{ sender: 'noreply_inem@inem.pt', subject: 'Token code: 111111', receivedAt: '2026-09-02T10:00:05.000Z' }];
    expect(selectOtpMessage(messages, SINCE)).toEqual(messages[0]);
  });

  it('ignores a message from before the login attempt started (stale code)', () => {
    const messages = [{ sender: 'noreply_inem@inem.pt', subject: 'Token code: 111111', receivedAt: '2026-09-02T09:59:59.000Z' }];
    expect(selectOtpMessage(messages, SINCE)).toBeNull();
  });

  it('ignores a message from any sender other than the confirmed INEM address, subject match or not', () => {
    const messages = [{ sender: 'attacker@example.com', subject: 'Token code: 111111', receivedAt: '2026-09-02T10:00:05.000Z' }];
    expect(selectOtpMessage(messages, SINCE)).toBeNull();
  });

  it('ignores a message with no extractable code', () => {
    const messages = [{ sender: 'noreply_inem@inem.pt', subject: 'Your account', receivedAt: '2026-09-02T10:00:05.000Z' }];
    expect(selectOtpMessage(messages, SINCE)).toBeNull();
  });

  it('picks the newest of several valid candidates', () => {
    const messages = [
      { sender: 'noreply_inem@inem.pt', subject: 'Token code: 111111', receivedAt: '2026-09-02T10:00:05.000Z' },
      { sender: 'noreply_inem@inem.pt', subject: 'Token code: 222222', receivedAt: '2026-09-02T10:00:10.000Z' },
    ];
    expect(selectOtpMessage(messages, SINCE)?.subject).toBe('Token code: 222222');
  });

  it('matches the sender case-insensitively', () => {
    const messages = [{ sender: 'NoReply_INEM@inem.pt', subject: 'Token code: 111111', receivedAt: '2026-09-02T10:00:05.000Z' }];
    expect(selectOtpMessage(messages, SINCE)).toEqual(messages[0]);
  });
});

describe('parseOwaDisplayDate', () => {
  // The exact tooltip production served on 2026-09-03, alongside the container
  // clock that proved the offset: OWA showed "17:48" for a mail that had
  // actually landed at 16:48Z, with both the container and the browser context
  // pinned to UTC.
  it('reads OWA\'s localized tooltip as the mailbox timezone, not UTC', () => {
    expect(parseOwaDisplayDate('qui, 03/09/2026 17:48', 'Europe/Lisbon')).toBe('2026-09-03T16:48:00.000Z');
  });

  it('treats the date as day-before-month, per the mailbox\'s pt-PT locale', () => {
    // 03/09 is 3 September, not 9 March — the two differ by six months, so a
    // day/month swap would sail straight past a "recent enough" check.
    expect(parseOwaDisplayDate('qui, 03/09/2026 12:00', 'UTC')).toBe('2026-09-03T12:00:00.000Z');
  });

  it('applies the winter offset too, so DST is not baked in', () => {
    // Lisbon is UTC+0 in January and UTC+1 in September; a hardcoded +1 would
    // silently shift every timestamp for half the year.
    expect(parseOwaDisplayDate('seg, 05/01/2026 09:30', 'Europe/Lisbon')).toBe('2026-01-05T09:30:00.000Z');
  });

  it('returns null for a tooltip that carries no date at all', () => {
    expect(parseOwaDisplayDate('Marcar como lida', 'Europe/Lisbon')).toBeNull();
    expect(parseOwaDisplayDate('', 'Europe/Lisbon')).toBeNull();
  });
});

describe('selectOtpMessage — OWA minute granularity', () => {
  const mail = (receivedAt: string): MailSummary => ({
    sender: INEM_OTP_SENDER,
    subject: 'Token code: 123456',
    receivedAt,
  });

  it('still matches when the mail lands in the same minute the attempt started', () => {
    // OWA renders no seconds, so this mail reads as 17:48:00 while the attempt
    // started at 17:48:04 — a strict `>` would drop the very code being waited
    // on, which is the common case since the submit triggers the mail.
    expect(selectOtpMessage([mail('2026-09-03T17:48:00.000Z')], '2026-09-03T17:48:04.433Z')).not.toBeNull();
  });

  it('still rejects a code from a previous minute', () => {
    expect(selectOtpMessage([mail('2026-09-03T17:47:00.000Z')], '2026-09-03T17:48:04.433Z')).toBeNull();
  });
});
