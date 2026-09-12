import { Injectable, NotFoundException } from '@nestjs/common';
import {
  isOnPaidClock,
  PaidStaffScheduleBlock,
  PaidStaffScheduleOverride,
  PaidStaffScheduleResponse,
} from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ApiBadRequestException } from '../common/api-error.exception';
import { toIsoDate, parseIsoDate } from '../utils/date.util';
import { CreatePaidStaffScheduleBlockDto } from './dto/create-schedule-block.dto';
import { CreatePaidStaffScheduleOverrideDto } from './dto/create-schedule-override.dto';

type BlockRow = {
  id: string;
  userId: string;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
};

type OverrideRow = {
  id: string;
  userId: string;
  date: Date;
  isOff: boolean;
  startMinute: number | null;
  endMinute: number | null;
  notes: string | null;
};

const toBlock = (row: BlockRow): PaidStaffScheduleBlock => ({
  id: row.id,
  userId: row.userId,
  dayOfWeek: row.dayOfWeek,
  startMinute: row.startMinute,
  endMinute: row.endMinute,
  effectiveFrom: toIsoDate(row.effectiveFrom),
  effectiveTo: row.effectiveTo ? toIsoDate(row.effectiveTo) : null,
});

const toOverride = (row: OverrideRow): PaidStaffScheduleOverride => ({
  id: row.id,
  userId: row.userId,
  date: toIsoDate(row.date),
  isOff: row.isOff,
  startMinute: row.startMinute,
  endMinute: row.endMinute,
  notes: row.notes,
});

/**
 * A paid staffer's on-the-clock hours (#245) — replaces #223's blanket
 * `User.isPaidStaff`-only gate for volunteer-hours generation with an actual
 * schedule. `isOnClock` is this module's real product: the answer
 * `VolunteerHoursService` needs before deciding whether an assignment
 * generates an entry. Everything else here (blocks, overrides) is what a
 * coordinator edits to keep that answer honest.
 */
@Injectable()
export class PaidStaffScheduleService {
  constructor(private readonly prisma: PrismaService) {}

  async getSchedule(userId: string): Promise<PaidStaffScheduleResponse> {
    const [blocks, overrides] = await Promise.all([
      this.prisma.paidStaffSchedule.findMany({ where: { userId }, orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }] }),
      this.prisma.paidStaffScheduleOverride.findMany({ where: { userId }, orderBy: { date: 'asc' } }),
    ]);
    return { userId, blocks: blocks.map(toBlock), overrides: overrides.map(toOverride) };
  }

  async addBlock(userId: string, dto: CreatePaidStaffScheduleBlockDto, createdById: string): Promise<PaidStaffScheduleBlock> {
    if (dto.endMinute <= dto.startMinute) {
      throw new ApiBadRequestException(
        'PAID_STAFF_SCHEDULE_INVALID_RANGE',
        'A schedule block must end after it starts.',
      );
    }
    if (dto.effectiveTo && dto.effectiveTo < dto.effectiveFrom) {
      throw new ApiBadRequestException(
        'PAID_STAFF_SCHEDULE_INVALID_RANGE',
        'The effective-to date cannot be before the effective-from date.',
      );
    }
    const row = await this.prisma.paidStaffSchedule.create({
      data: {
        userId,
        dayOfWeek: dto.dayOfWeek,
        startMinute: dto.startMinute,
        endMinute: dto.endMinute,
        effectiveFrom: parseIsoDate(dto.effectiveFrom),
        effectiveTo: dto.effectiveTo ? parseIsoDate(dto.effectiveTo) : null,
        createdById,
      },
    });
    return toBlock(row);
  }

  async removeBlock(userId: string, blockId: string): Promise<{ id: string }> {
    const row = await this.prisma.paidStaffSchedule.findUnique({ where: { id: blockId } });
    if (!row || row.userId !== userId) throw new NotFoundException(`Schedule block ${blockId} not found`);
    await this.prisma.paidStaffSchedule.delete({ where: { id: blockId } });
    return { id: blockId };
  }

  /** Upserts by `(userId, date)` — one override per person per date, per the schema's own unique constraint. */
  async setOverride(
    userId: string,
    dto: CreatePaidStaffScheduleOverrideDto,
    createdById: string,
  ): Promise<PaidStaffScheduleOverride> {
    if (!dto.isOff && (dto.startMinute == null || dto.endMinute == null)) {
      throw new ApiBadRequestException(
        'PAID_STAFF_SCHEDULE_INVALID_RANGE',
        'Custom hours are required when the override is not a day off.',
      );
    }
    if (!dto.isOff && dto.startMinute != null && dto.endMinute != null && dto.endMinute <= dto.startMinute) {
      throw new ApiBadRequestException(
        'PAID_STAFF_SCHEDULE_INVALID_RANGE',
        'A schedule override must end after it starts.',
      );
    }
    const date = parseIsoDate(dto.date);
    const data = {
      isOff: dto.isOff,
      startMinute: dto.isOff ? null : (dto.startMinute ?? null),
      endMinute: dto.isOff ? null : (dto.endMinute ?? null),
      notes: dto.notes?.trim() || null,
    };
    const row = await this.prisma.paidStaffScheduleOverride.upsert({
      where: { userId_date: { userId, date } },
      create: { userId, date, createdById, ...data },
      update: data,
    });
    return toOverride(row);
  }

  async removeOverride(userId: string, overrideId: string): Promise<{ id: string }> {
    const row = await this.prisma.paidStaffScheduleOverride.findUnique({ where: { id: overrideId } });
    if (!row || row.userId !== userId) throw new NotFoundException(`Schedule override ${overrideId} not found`);
    await this.prisma.paidStaffScheduleOverride.delete({ where: { id: overrideId } });
    return { id: overrideId };
  }

  /**
   * Whether `userId` was on the clock for some `[shiftStartMinute,
   * shiftEndMinute)` window on `date`. The one method `VolunteerHoursService`
   * actually calls — see `isOnPaidClock` (shared) for the resolution rule
   * itself, kept there as a pure function so it can be unit tested without a
   * database.
   */
  async isOnClock(userId: string, date: string, shiftStartMinute: number, shiftEndMinute: number): Promise<boolean> {
    const [blocks, override] = await Promise.all([
      this.prisma.paidStaffSchedule.findMany({ where: { userId } }),
      this.prisma.paidStaffScheduleOverride.findUnique({ where: { userId_date: { userId, date: parseIsoDate(date) } } }),
    ]);
    return isOnPaidClock(
      blocks.map(toBlock),
      override ? [toOverride(override)] : [],
      date,
      shiftStartMinute,
      shiftEndMinute,
    );
  }
}
