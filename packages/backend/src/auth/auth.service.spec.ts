import { UserRole } from '@prisma/client';
import { AuthService } from './auth.service';

// ── "Keep me signed in" — remember-token TTL class ─────────────────────────
//
// `generateTokens` picks a refresh-token lifetime by `remember`, and
// `refresh()` must carry that choice forward through rotation by reading it
// off the token being replaced (`stored.remember`) rather than trusting the
// client to resend it — the client never gets another chance to say it after
// the first login. See the doc comment on `RefreshToken.remember`.

const person = {
  id: 'u-1',
  email: 'ana.silva@example.test',
  role: UserRole.EMERGENCY_OPERATIONAL,
};

function makeService(configOverrides: Record<string, string> = {}) {
  const prisma = {
    refreshToken: {
      create: jest.fn().mockResolvedValue(undefined),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    },
  };
  const usersService = { findOne: jest.fn().mockResolvedValue(person) };
  const jwtService = { sign: jest.fn(() => 'signed-token') };
  const config = { get: jest.fn((key: string) => configOverrides[key]) };

  const service = new AuthService(
    prisma as never,
    usersService as never,
    jwtService as never,
    config as never,
  );

  return { service, prisma, usersService, jwtService };
}

/** Days between two dates, rounded — avoids asserting on exact millisecond timing. */
function daysBetween(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / (24 * 60 * 60 * 1000));
}

describe('AuthService.generateTokens — remember', () => {
  it('defaults to a 7-day refresh token when not remembered', async () => {
    const { service, prisma } = makeService();

    await service.generateTokens(person);

    const data = prisma.refreshToken.create.mock.calls[0][0].data;
    expect(data.remember).toBe(false);
    expect(daysBetween(data.expiresAt, new Date())).toBe(7);
  });

  it('issues a 30-day refresh token when remembered', async () => {
    const { service, prisma } = makeService();

    await service.generateTokens(person, true);

    const data = prisma.refreshToken.create.mock.calls[0][0].data;
    expect(data.remember).toBe(true);
    expect(daysBetween(data.expiresAt, new Date())).toBe(30);
  });

  it('respects an overridden JWT_REFRESH_EXPIRES_IN_REMEMBER', async () => {
    const { service, prisma } = makeService({ JWT_REFRESH_EXPIRES_IN_REMEMBER: '14d' });

    await service.generateTokens(person, true);

    const data = prisma.refreshToken.create.mock.calls[0][0].data;
    expect(daysBetween(data.expiresAt, new Date())).toBe(14);
  });
});

describe('AuthService.login — remember', () => {
  it('passes the flag through to token generation', async () => {
    const { service, prisma } = makeService();

    await service.login(person.id, true);

    expect(prisma.refreshToken.create.mock.calls[0][0].data.remember).toBe(true);
  });

  it('defaults to false when omitted', async () => {
    const { service, prisma } = makeService();

    await service.login(person.id);

    expect(prisma.refreshToken.create.mock.calls[0][0].data.remember).toBe(false);
  });
});

describe('AuthService.refresh — carries remember through rotation', () => {
  it('re-issues a long-lived token when the rotated one was remembered', async () => {
    const { service, prisma } = makeService();
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt-1',
      token: 'old-token',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      remember: true,
      user: { ...person, isActive: true },
    });

    await service.refresh('old-token');

    expect(prisma.refreshToken.update).toHaveBeenCalledWith({
      where: { id: 'rt-1' },
      data: { revokedAt: expect.any(Date) },
    });
    const data = prisma.refreshToken.create.mock.calls[0][0].data;
    expect(data.remember).toBe(true);
    expect(daysBetween(data.expiresAt, new Date())).toBe(30);
  });

  it('keeps a short-lived rotation short', async () => {
    const { service, prisma } = makeService();
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt-2',
      token: 'old-token',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      remember: false,
      user: { ...person, isActive: true },
    });

    await service.refresh('old-token');

    const data = prisma.refreshToken.create.mock.calls[0][0].data;
    expect(data.remember).toBe(false);
    expect(daysBetween(data.expiresAt, new Date())).toBe(7);
  });

  it('rejects an expired or revoked token before rotating', async () => {
    const { service, prisma } = makeService();
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt-3',
      token: 'old-token',
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      remember: false,
      user: { ...person, isActive: true },
    });

    await expect(service.refresh('old-token')).rejects.toThrow('Invalid or expired refresh token');
  });
});
