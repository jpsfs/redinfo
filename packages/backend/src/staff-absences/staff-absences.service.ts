import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  Action,
  hasPermission,
  isValidStaffAbsenceRange,
  isValidStaffAbsenceTimeRange,
  StaffAbsence,
  StaffAbsenceKind,
  staffAbsenceRangesOverlap,
  UserRole,
} from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { isIsoDate, parseIsoDate, toIsoDate } from '../utils/date.util';
import { CreateStaffAbsenceDto } from './dto/create-staff-absence.dto';
import { UpdateStaffAbsenceDto } from './dto/update-staff-absence.dto';

/** Just enough of the caller to answer "may they see this, and whose". */
export interface RequestUser {
  id: string;
  roles: UserRole[];
}

type AbsenceRow = {
  id: string;
  userId: string;
  kind: string;
  startDate: Date;
  endDate: Date;
  startTime: string | null;
  endTime: string | null;
  notes: string | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
};

const toAbsence = (row: AbsenceRow): StaffAbsence => ({
  id: row.id,
  userId: row.userId,
  kind: row.kind as StaffAbsenceKind,
  startDate: toIsoDate(row.startDate),
  endDate: toIsoDate(row.endDate),
  startTime: row.startTime,
  endTime: row.endTime,
  notes: row.notes,
  createdById: row.createdById,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

/**
 * Staff absence calendar (#224) — vacation, sick leave and other paid leave
 * as a durable HR fact, distinct from `PaidStaffScheduleOverride`'s ad-hoc
 * schedule shuffles. Entitlement balances, accrual, carry-over and approval
 * workflow are explicitly out of scope (#219 rules it out by name): this is
 * a dated record and nothing more.
 */
@Injectable()
export class StaffAbsencesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `GET /staff-absences?from&to&userId?`. Reading one's own needs no
   * `Action`, the same way `GET /schedules/me` doesn't — it's you. Without
   * `MANAGE_PERSONNEL` the result is always scoped to the caller: an
   * explicit `userId` for someone else is refused rather than silently
   * narrowed, so a client bug never looks like "nobody else is absent".
   */
  async list(user: RequestUser, from: string, to: string, userId?: string): Promise<StaffAbsence[]> {
    if (!isIsoDate(from) || !isIsoDate(to)) {
      throw new BadRequestException('from/to must be ISO dates.');
    }
    const canManage = hasPermission(user.roles, Action.MANAGE_PERSONNEL);
    let scopedUserId = userId;
    if (!canManage) {
      if (userId && userId !== user.id) {
        throw new ForbiddenException('You can only see your own absences.');
      }
      scopedUserId = user.id;
    }
    const rows = await this.prisma.staffAbsence.findMany({
      where: {
        ...(scopedUserId ? { userId: scopedUserId } : {}),
        startDate: { lte: parseIsoDate(to) },
        endDate: { gte: parseIsoDate(from) },
      },
      orderBy: [{ startDate: 'asc' }],
    });
    return rows.map(toAbsence);
  }

  /**
   * Absences overlapping `[from, to]` at all, unscoped by viewer — the
   * method the roster and (later) the trip planner call to answer "who is
   * absent on date D". Internal, server-to-server use only: callers must be
   * trusted code, not a controller passing a caller-supplied range through
   * unchecked, since this deliberately skips the `MANAGE_PERSONNEL` gate
   * `list` enforces for a human reading the calendar.
   */
  async findOverlapping(from: string, to: string): Promise<StaffAbsence[]> {
    const rows = await this.prisma.staffAbsence.findMany({
      where: {
        startDate: { lte: parseIsoDate(to) },
        endDate: { gte: parseIsoDate(from) },
      },
    });
    return rows.map(toAbsence);
  }

  /**
   * One person may not hold two overlapping absences — which one would a
   * caller asking "who is absent on date D" even mean? A correction edits
   * the existing row instead (`update`).
   */
  async create(dto: CreateStaffAbsenceDto, createdById: string): Promise<StaffAbsence> {
    if (!isValidStaffAbsenceRange(dto.startDate, dto.endDate)) {
      throw new BadRequestException('An absence cannot end before it starts.');
    }
    if (!isValidStaffAbsenceTimeRange(dto.kind, dto.startDate, dto.endDate, dto.startTime, dto.endTime)) {
      throw new BadRequestException(
        'A partial day is only valid for other paid leave, needs both a start and end time, on a single-day range, with the end after the start.',
      );
    }
    const existing = await this.prisma.staffAbsence.findMany({ where: { userId: dto.userId } });
    const overlap = existing.find((row) =>
      staffAbsenceRangesOverlap(dto.startDate, dto.endDate, toIsoDate(row.startDate), toIsoDate(row.endDate)),
    );
    if (overlap) {
      throw new ConflictException(
        'This person already has an absence covering some of these dates — edit that one instead.',
      );
    }

    const row = await this.prisma.staffAbsence.create({
      data: {
        userId: dto.userId,
        kind: dto.kind,
        startDate: parseIsoDate(dto.startDate),
        endDate: parseIsoDate(dto.endDate),
        startTime: dto.startTime ?? null,
        endTime: dto.endTime ?? null,
        notes: dto.notes ?? null,
        createdById,
      },
    });
    return toAbsence(row);
  }

  /** `PATCH /staff-absences/:id` — a whole-row correction, see the DTO's doc comment. */
  async update(id: string, dto: UpdateStaffAbsenceDto): Promise<StaffAbsence> {
    const row = await this.prisma.staffAbsence.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException(`Staff absence ${id} not found`);
    }
    if (!isValidStaffAbsenceRange(dto.startDate, dto.endDate)) {
      throw new BadRequestException('An absence cannot end before it starts.');
    }
    if (!isValidStaffAbsenceTimeRange(dto.kind, dto.startDate, dto.endDate, dto.startTime, dto.endTime)) {
      throw new BadRequestException(
        'A partial day is only valid for other paid leave, needs both a start and end time, on a single-day range, with the end after the start.',
      );
    }
    const existing = await this.prisma.staffAbsence.findMany({
      where: { userId: row.userId, id: { not: id } },
    });
    const overlap = existing.find((other) =>
      staffAbsenceRangesOverlap(dto.startDate, dto.endDate, toIsoDate(other.startDate), toIsoDate(other.endDate)),
    );
    if (overlap) {
      throw new ConflictException(
        'This person already has an absence covering some of these dates — edit that one instead.',
      );
    }

    const updated = await this.prisma.staffAbsence.update({
      where: { id },
      data: {
        kind: dto.kind,
        startDate: parseIsoDate(dto.startDate),
        endDate: parseIsoDate(dto.endDate),
        startTime: dto.startTime ?? null,
        endTime: dto.endTime ?? null,
        notes: dto.notes ?? null,
      },
    });
    return toAbsence(updated);
  }

  async remove(id: string): Promise<{ id: string }> {
    const row = await this.prisma.staffAbsence.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException(`Staff absence ${id} not found`);
    }
    await this.prisma.staffAbsence.delete({ where: { id } });
    return { id };
  }
}
