import { AuthProvider, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
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
  const usersService = { findOne: jest.fn().mockResolvedValue(person), findByEmail: jest.fn() };
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

// ── validateLocalUser — the DISABLE_LOCAL_LOGIN kill switch and the ────────
// one-way lock once an account is linked to OAuth (see
// `UsersService.findOrLinkOAuthUser`).

describe('AuthService.validateLocalUser', () => {
  const localUser = {
    id: 'u-2',
    email: 'ana.silva@example.test',
    role: UserRole.EMERGENCY_OPERATIONAL,
    provider: AuthProvider.LOCAL,
    isActive: true,
    passwordHash: bcrypt.hashSync('CorrectPass1!', 12),
  };

  it('accepts the right password for a LOCAL, active account', async () => {
    const { service, usersService } = makeService();
    usersService.findByEmail.mockResolvedValue(localUser);

    await expect(service.validateLocalUser(localUser.email, 'CorrectPass1!')).resolves.toEqual(localUser);
  });

  it('rejects the wrong password', async () => {
    const { service, usersService } = makeService();
    usersService.findByEmail.mockResolvedValue(localUser);

    await expect(service.validateLocalUser(localUser.email, 'WrongPass!')).resolves.toBeNull();
  });

  it('rejects an account with no password hash (OAuth-only)', async () => {
    const { service, usersService } = makeService();
    usersService.findByEmail.mockResolvedValue({ ...localUser, passwordHash: null });

    await expect(service.validateLocalUser(localUser.email, 'CorrectPass1!')).resolves.toBeNull();
  });

  it('rejects an account already linked to OAuth even if a password hash still exists', async () => {
    const { service, usersService } = makeService();
    usersService.findByEmail.mockResolvedValue({ ...localUser, provider: AuthProvider.GOOGLE });

    await expect(service.validateLocalUser(localUser.email, 'CorrectPass1!')).resolves.toBeNull();
  });

  it('rejects a deactivated account', async () => {
    const { service, usersService } = makeService();
    usersService.findByEmail.mockResolvedValue({ ...localUser, isActive: false });

    await expect(service.validateLocalUser(localUser.email, 'CorrectPass1!')).resolves.toBeNull();
  });

  it('rejects everyone, right password included, when DISABLE_LOCAL_LOGIN is set', async () => {
    const { service, usersService } = makeService({ DISABLE_LOCAL_LOGIN: 'true' });
    usersService.findByEmail.mockResolvedValue(localUser);

    await expect(service.validateLocalUser(localUser.email, 'CorrectPass1!')).resolves.toBeNull();
    expect(usersService.findByEmail).not.toHaveBeenCalled();
  });

  it('isLocalLoginEnabled reflects the flag', () => {
    expect(makeService().service.isLocalLoginEnabled()).toBe(true);
    expect(makeService({ DISABLE_LOCAL_LOGIN: 'true' }).service.isLocalLoginEnabled()).toBe(false);
  });
});
