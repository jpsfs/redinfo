import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { User } from '@prisma/client';
import { addDays } from '../utils/date.util';

/** Refresh-token lifetime when the client didn't ask to be remembered. */
const DEFAULT_REFRESH_DAYS = 7;
/** Refresh-token lifetime for "keep me signed in". */
const REMEMBER_REFRESH_DAYS = 30;

/**
 * Parses an env-style `'<n>d'` duration into whole days, falling back when
 * unset or in a shape (e.g. `'15m'`) this service doesn't expect for a
 * refresh token — keeps the DB row's `expiresAt` and the JWT's own `exp`
 * agreeing on the same lifetime instead of drifting apart.
 */
function parseDaysDuration(value: string | undefined, fallbackDays: number): number {
  const match = value ? /^(\d+)d$/.exec(value.trim()) : null;
  return match ? Number(match[1]) : fallbackDays;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private usersService: UsersService,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  // ── Local validation ────────────────────────────────────────────────────────

  async validateLocalUser(email: string, password: string): Promise<User | null> {
    const user = await this.usersService.findByEmail(email);
    if (!user || !user.passwordHash) return null;
    if (!user.isActive) return null;

    const valid = await bcrypt.compare(password, user.passwordHash);
    return valid ? user : null;
  }

  // ── Token generation ────────────────────────────────────────────────────────

  /**
   * `remember` selects the refresh token's TTL class — see the `remember`
   * doc comment on the `RefreshToken` model for why `refresh()` re-derives
   * it from the token being rotated rather than taking it as a parameter.
   */
  async generateTokens(user: Pick<User, 'id' | 'email' | 'role'>, remember = false) {
    const payload = { sub: user.id, email: user.email, role: user.role };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m',
    });

    const refreshExpiresIn = remember
      ? (this.config.get<string>('JWT_REFRESH_EXPIRES_IN_REMEMBER') ?? '30d')
      : (this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d');
    const refreshDays = parseDaysDuration(
      refreshExpiresIn,
      remember ? REMEMBER_REFRESH_DAYS : DEFAULT_REFRESH_DAYS,
    );

    const rawRefresh = this.jwtService.sign(payload, { expiresIn: refreshExpiresIn });

    // Persist refresh token
    await this.prisma.refreshToken.create({
      data: {
        token: rawRefresh,
        userId: user.id,
        expiresAt: addDays(new Date(), refreshDays),
        remember,
      },
    });

    return { accessToken, refreshToken: rawRefresh };
  }

  /**
   * `userId` rather than a full row: the response's `user` must carry the
   * computed personnel fields (`isDriver`, `isActiveEmergencyOperational`),
   * which only `UsersService.findOne` knows how to assemble.
   */
  async login(userId: string, remember = false) {
    const person = await this.usersService.findOne(userId);
    const tokens = await this.generateTokens(person, remember);
    return { ...tokens, user: person };
  }

  // ── Refresh ─────────────────────────────────────────────────────────────────

  async refresh(rawToken: string) {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: rawToken },
      include: { user: true },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (!stored.user.isActive) {
      throw new ForbiddenException('Account is inactive');
    }

    // Rotate: revoke old, issue new — carrying forward the same "remember"
    // TTL class the original login chose.
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.generateTokens(stored.user, stored.remember);
  }

  // ── Logout ──────────────────────────────────────────────────────────────────

  async logout(rawToken: string) {
    await this.prisma.refreshToken.updateMany({
      where: { token: rawToken },
      data: { revokedAt: new Date() },
    });
  }

  // ── Me ───────────────────────────────────────────────────────────────────────

  sanitize<T extends { passwordHash?: string | null }>(user: T): Omit<T, 'passwordHash'> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...safe } = user;
    return safe;
  }
}
