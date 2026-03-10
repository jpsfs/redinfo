import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AuthProvider, UserRole } from '@prisma/client';

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
        isActive: true,
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
      },
      select: this.safeSelect(),
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.user.delete({ where: { id }, select: this.safeSelect() });
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
      createdAt: true,
      updatedAt: true,
      passwordHash: false,
    };
  }
}
