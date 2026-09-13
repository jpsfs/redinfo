import { Injectable, NotFoundException } from '@nestjs/common';
import {
  EmploymentContract,
  isOnContractClock,
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

type ContractRow = {
  userId: string;
  startDate: Date;
  endDate: Date | null;
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

const toContractRange = (row: ContractRow): Pick<EmploymentContract, 'startDate' | 'endDate'> => ({
  startDate: toIsoDate(row.startDate),
  endDate: row.endDate ? toIsoDate(row.endDate) : null,
});

/** Two inclusive date ranges (`end` null = open-ended) sharing any day at all. */
function dateRangesOverlap(aStart: string, aEnd: string | null, bStart: string, bEnd: string | null): boolean {
  const aEndsAfterBStarts = aEnd === null || aEnd >= bStart;
  const bEndsAfterAStarts = bEnd === null || bEnd >= aStart;
  return aEndsAfterBStarts && bEndsAfterAStarts;
}

/** Everything `isOnContractClock` needs for one person, over a date range. */
export interface ClockContext {
  contracts: Array<Pick<EmploymentContract, 'startDate' | 'endDate'>>;
  blocks: PaidStaffScheduleBlock[];
  overrides: PaidStaffScheduleOverride[];
}

/**
 * A paid staffer's on-the-clock hours (#245, contract-aware since Stage 1 of
 * the paid-staff rework) — replaces #223's blanket `User.isPaidStaff`-only
 * gate for volunteer-hours generation with an actual schedule, gated by a
 * dated `EmploymentContract` rather than a timeless flag. `isOnClock` and its
 * batched sibling `loadClockContext` are this module's real product: the
 * answer `resolveAssignmentCompensation` needs before an assignment's
 * compensation is written. Everything else here (blocks, overrides) is what
 * a coordinator edits to keep that answer honest.
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

    const contract = await this.prisma.employmentContract.findUnique({ where: { id: dto.contractId } });
    if (!contract || contract.userId !== userId) {
      throw new NotFoundException(`Employment contract ${dto.contractId} not found`);
    }
    const contractStart = toIsoDate(contract.startDate);
    const contractEnd = contract.endDate ? toIsoDate(contract.endDate) : null;
    if (dto.effectiveFrom < contractStart || (contractEnd !== null && dto.effectiveFrom > contractEnd)) {
      throw new ApiBadRequestException(
        'PAID_STAFF_SCHEDULE_INVALID_RANGE',
        "This block's start must fall within the contract's own dates.",
      );
    }
    if (dto.effectiveTo && contractEnd !== null && dto.effectiveTo > contractEnd) {
      throw new ApiBadRequestException(
        'PAID_STAFF_SCHEDULE_INVALID_RANGE',
        "This block's end cannot run past the contract's own end date.",
      );
    }

    // Overlap guard (a #245 oversight): two blocks for the same person, same
    // day of week, whose minute ranges and effective date ranges both
    // overlap would leave `isOnPaidClock` with two conflicting answers for
    // the same instant — not itself wrong (it only needs one to match), but
    // a sign the data no longer describes one coherent pattern.
    const siblings = await this.prisma.paidStaffSchedule.findMany({ where: { userId, dayOfWeek: dto.dayOfWeek } });
    const overlap = siblings.find((row) => {
      const datesOverlap = dateRangesOverlap(
        dto.effectiveFrom,
        dto.effectiveTo ?? null,
        toIsoDate(row.effectiveFrom),
        row.effectiveTo ? toIsoDate(row.effectiveTo) : null,
      );
      return datesOverlap && dto.startMinute < row.endMinute && row.startMinute < dto.endMinute;
    });
    if (overlap) {
      throw new ApiBadRequestException(
        'PAID_STAFF_SCHEDULE_INVALID_RANGE',
        'This overlaps another block already on file for the same day of week.',
      );
    }

    const row = await this.prisma.paidStaffSchedule.create({
      data: {
        userId,
        contractId: dto.contractId,
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
   * Whether `userId` was on a contract's clock for some `[shiftStartMinute,
   * shiftEndMinute)` window on `date`. The one method callers with a single
   * assignment in hand (`ScheduleAssignmentsService.assign`) use — see
   * `loadClockContext` for the batched form a whole shift's crew needs.
   */
  async isOnClock(userId: string, date: string, shiftStartMinute: number, shiftEndMinute: number): Promise<boolean> {
    const context = (await this.loadClockContext([userId], { start: date, end: date })).get(userId);
    if (!context) return false;
    return isOnContractClock({
      contracts: context.contracts,
      blocks: context.blocks,
      overrides: context.overrides,
      date,
      startMinute: shiftStartMinute,
      endMinute: shiftEndMinute,
    });
  }

  /**
   * Batched form of the same lookup, grouped per user — three queries total
   * regardless of how many people are involved, rather than `isOnClock`'s two
   * per person. `setCompensation` (a whole shift's crew at once) is the
   * caller this exists for: awaiting `isOnClock` in a loop over a ~300-
   * assignment board was the thing this replaces.
   *
   * `dateRange` bounds every query so this stays cheap even for a userId list
   * spanning the whole roster — contracts/blocks still in effect at any point
   * in the range, and overrides that actually fall inside it. Resolution
   * itself (`isOnContractClock`) is left to the caller, one date/shift at a
   * time, from the in-memory context this returns.
   */
  async loadClockContext(
    userIds: string[],
    dateRange: { start: string; end: string },
  ): Promise<Map<string, ClockContext>> {
    const result = new Map<string, ClockContext>();
    for (const userId of userIds) result.set(userId, { contracts: [], blocks: [], overrides: [] });
    if (userIds.length === 0) return result;

    const start = parseIsoDate(dateRange.start);
    const end = parseIsoDate(dateRange.end);

    const [contracts, blocks, overrides] = await Promise.all([
      this.prisma.employmentContract.findMany({
        where: {
          userId: { in: userIds },
          startDate: { lte: end },
          OR: [{ endDate: null }, { endDate: { gte: start } }],
        },
      }),
      this.prisma.paidStaffSchedule.findMany({
        where: {
          userId: { in: userIds },
          effectiveFrom: { lte: end },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: start } }],
        },
      }),
      this.prisma.paidStaffScheduleOverride.findMany({
        where: { userId: { in: userIds }, date: { gte: start, lte: end } },
      }),
    ]);

    for (const row of contracts) result.get(row.userId)?.contracts.push(toContractRange(row));
    for (const row of blocks) result.get(row.userId)?.blocks.push(toBlock(row));
    for (const row of overrides) result.get(row.userId)?.overrides.push(toOverride(row));
    return result;
  }
}
