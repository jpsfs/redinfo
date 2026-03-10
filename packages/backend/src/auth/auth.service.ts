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

  async generateTokens(user: User) {
    const payload = { sub: user.id, email: user.email, role: user.role };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m',
    });

    const rawRefresh = this.jwtService.sign(payload, {
      expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d',
    });

    // Persist refresh token
    await this.prisma.refreshToken.create({
      data: {
        token: rawRefresh,
        userId: user.id,
        expiresAt: addDays(new Date(), 7),
      },
    });

    return { accessToken, refreshToken: rawRefresh };
  }

  async login(user: User) {
    const tokens = await this.generateTokens(user);
    return { ...tokens, user: this.sanitize(user) };
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

    // Rotate: revoke old, issue new
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.generateTokens(stored.user);
  }

  // ── Logout ──────────────────────────────────────────────────────────────────

  async logout(rawToken: string) {
    await this.prisma.refreshToken.updateMany({
      where: { token: rawToken },
      data: { revokedAt: new Date() },
    });
  }

  // ── Me ───────────────────────────────────────────────────────────────────────

  sanitize(user: User) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...safe } = user;
    return safe;
  }
}
