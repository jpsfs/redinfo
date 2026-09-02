import { extractOtpCode, selectOtpMessage } from './otp-mail';

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
