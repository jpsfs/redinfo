import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AuthProvider, Prisma, UserRole } from '@prisma/client';

/**
 * Whether a delete failed because another row still points at this one.
 *
 * Two shapes, both seen in practice: Prisma maps some foreign-key failures to
 * a known code, but a Postgres `RESTRICT` violation (SQLSTATE 23001) is not one
 * of them — that arrives as an *unknown* request error carrying the raw
 * connector message, so the code alone is not enough to recognise it.
 */
function isStillReferenced(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // P2003: foreign key constraint failed. P2014: required relation violated.
    return error.code === 'P2003' || error.code === 'P2014';
  }
  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    return /\b23001\b|violates RESTRICT|foreign key constraint/i.test(error.message);
  }
  return false;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(page = 1, perPage = 25) {
    const skip = (page - 1) * perPage;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        skip,
        take: perPage,
        orderBy: { createdAt: 'desc' },
        select: this.safeSelect(),
      }),
      this.prisma.user.count(),
    ]);
    return { data, total, page, perPage };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: this.safeSelect(),
    });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findOrCreateOAuthUser(params: {
    email: string;
    firstName: string;
    lastName: string;
    provider: AuthProvider;
    providerId: string;
  }) {
    const existing = await this.prisma.user.findFirst({
      where: { provider: params.provider, providerId: params.providerId },
    });
    if (existing) return existing;

    // Also check by email to avoid duplicates
    const byEmail = await this.prisma.user.findUnique({ where: { email: params.email } });
    if (byEmail) {
      return this.prisma.user.update({
        where: { id: byEmail.id },
        data: { provider: params.provider, providerId: params.providerId },
      });
    }

    return this.prisma.user.create({
      data: {
        ...params,
        role: UserRole.EMERGENCY_OPERATIONAL,
        isActive: true,
      },
    });
  }

  async create(dto: CreateUserDto) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('Email already in use');

    const passwordHash = dto.password ? await bcrypt.hash(dto.password, 12) : null;

    return this.prisma.user.create({
      data: {
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        passwordHash,
        role: dto.role ?? UserRole.EMERGENCY_OPERATIONAL,
        provider: AuthProvider.LOCAL,
        isActive: dto.isActive ?? true,
        isDriver: dto.isDriver ?? false,
      },
      select: this.safeSelect(),
    });
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id);
    const passwordHash = dto.password ? await bcrypt.hash(dto.password, 12) : undefined;

    return this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.email && { email: dto.email }),
        ...(dto.firstName && { firstName: dto.firstName }),
        ...(dto.lastName && { lastName: dto.lastName }),
        ...(dto.role && { role: dto.role }),
        ...(passwordHash && { passwordHash }),
        // isActive and isDriver are booleans, so they need an explicit
        // undefined check — `false` must still be persisted. isActive gates who
        // appears on the availability roster, isDriver gates shift eligibility.
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.isDriver !== undefined && { isDriver: dto.isDriver }),
      },
      select: this.safeSelect(),
    });
  }

  /**
   * Records that must outlive the person — an emergency report names its crew,
   * and that history is not rewritten because someone left — hold their row
   * with a `Restrict` foreign key. Reported as a conflict pointing at
   * deactivation rather than surfacing a raw constraint violation as a 500.
   */
  async remove(id: string) {
    await this.findOne(id);
    try {
      return await this.prisma.user.delete({ where: { id }, select: this.safeSelect() });
    } catch (error) {
      if (isStillReferenced(error)) {
        throw new ConflictException(
          'This person is named on records that must keep their history, such as ' +
            'emergency reports. Deactivate them instead of deleting them.',
        );
      }
      throw error;
    }
  }

  private safeSelect() {
    return {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      provider: true,
      isActive: true,
      isDriver: true,
      createdAt: true,
      updatedAt: true,
      passwordHash: false,
    };
  }
}
