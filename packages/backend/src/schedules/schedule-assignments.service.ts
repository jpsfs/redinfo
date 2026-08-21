import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AssignmentAvailability,
  AvailabilityWindowRole,
  availabilityEligibleRoles,
  availabilityWindowLabel,
  formatRoleCapacity,
  ScheduleAssignment,
  ScheduleCandidate,
  ScheduleCandidatesResponse,
  ShiftDefinition,
  roleCanTakeMore,
  shiftsOverlap,
} from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ShiftScheduleService } from '../availability/shift-schedule.service';
import { toIsoDate } from '../utils/date.util';
import { CreateScheduleAssignmentDto } from './dto/create-assignment.dto';
import {
  ScheduleContext,
  SchedulesService,
  serializeAssignment,
  shiftKey,
} from './schedules.service';

const ASSIGNMENT_INCLUDE = {
  user: { select: { id: true, firstName: true, lastName: true, isDriver: true } },
  role: true,
  assignedBy: { select: { id: true, firstName: true, lastName: true } },
} as const;

const PERSON_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  isDriver: true,
} as const;

/**
 * Putting people on shifts, and working out who could go on one.
 *
 * The governing rule of #161 lives here: **availability guides the schedule, it
 * does not constrain it**. Cover is agreed by phone and in person as well as on
 * the platform, so a coordinator may place anyone — including someone who never
 * submitted, or who declared they had none. What the platform owes in return is
 * honesty: every such assignment is stamped as an override, with who and when.
 *
 * Exactly one rule is absolute, and it is not about availability: a role that
 * requires the driver certification only ever takes a certified driver.
 */
@Injectable()
export class ScheduleAssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schedules: SchedulesService,
    private readonly shiftSchedule: ShiftScheduleService,
  ) {}

  async assign(
    scheduleId: string,
    dto: CreateScheduleAssignmentDto,
    assignedById: string,
  ): Promise<ScheduleAssignment> {
    const context = await this.schedules.loadContext(scheduleId);
    this.assertShift(context, dto.date, dto.slot);
    const role = this.assertRole(context, dto.roleId ?? null);

    const person = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      select: { ...PERSON_SELECT, isActive: true, role: true },
    });
    if (!person) throw new NotFoundException(`User ${dto.userId} not found`);
    if (!person.isActive) {
      throw new BadRequestException(
        `${person.firstName} ${person.lastName} is not an active member and cannot be scheduled.`,
      );
    }
    if (!availabilityEligibleRoles().includes(person.role as never)) {
      throw new BadRequestException(
        `${person.firstName} ${person.lastName} is not field personnel and cannot be scheduled.`,
      );
    }

    // The one requirement no coordinator may override: a vehicle nobody may
    // legally drive is not cover.
    if (role?.requiresDriverCertification && !person.isDriver) {
      throw new BadRequestException(
        `${role.name} requires the driver certification, which ${person.firstName} ` +
          `${person.lastName} does not hold. This cannot be overridden.`,
      );
    }

    const onShift = await this.prisma.scheduleAssignment.findMany({
      where: { scheduleId, date: parseDate(dto.date), slot: dto.slot },
      include: { role: true, user: { select: PERSON_SELECT } },
    });

    const already = onShift.find((row) => row.userId === dto.userId);
    if (already) {
      throw new ConflictException(
        `${person.firstName} ${person.lastName} is already on this shift` +
          (already.role ? ` as ${already.role.name}` : '') +
          ' — one person cannot hold two places on one shift.',
      );
    }

    if (role) {
      const filled = onShift.filter((row) => row.roleId === role.id).length;
      if (!roleCanTakeMore(role, filled)) {
        throw new ConflictException(
          `${role.name} is full on this shift (${formatRoleCapacity(role.maxPeople)}). ` +
            'Remove someone first, or use another role.',
        );
      }
    }

    // Computed, never taken from the request: whether this contradicts what the
    // person submitted is a finding, not a claim the caller gets to make.
    const submission = await this.prisma.availabilitySubmission.findFirst({
      where: {
        windowId: context.window.id,
        userId: dto.userId,
        date: parseDate(dto.date),
        slot: dto.slot,
      },
      select: { id: true },
    });

    const created = await this.prisma.scheduleAssignment.create({
      data: {
        scheduleId,
        date: parseDate(dto.date),
        slot: dto.slot,
        userId: dto.userId,
        roleId: role?.id ?? null,
        isOverride: submission === null,
        assignedById,
      },
      include: ASSIGNMENT_INCLUDE,
    });

    const declined = await this.schedules.loadDeclinedUserIds(context.window.id);
    return serializeAssignment(created, dto.date, {
      submitted: submission !== null,
      declined: declined.has(dto.userId),
    });
  }

  async unassign(scheduleId: string, assignmentId: string): Promise<{ id: string }> {
    const row = await this.prisma.scheduleAssignment.findUnique({
      where: { id: assignmentId },
      select: { id: true, scheduleId: true },
    });
    if (!row || row.scheduleId !== scheduleId) {
      throw new NotFoundException(`Assignment ${assignmentId} not found on schedule ${scheduleId}`);
    }
    await this.prisma.scheduleAssignment.delete({ where: { id: assignmentId } });
    return { id: assignmentId };
  }

  /**
   * Who the coordinator could put on this shift, availability first.
   *
   * `available` is the easy path — people who submitted for exactly this shift.
   * `others` is everyone else eligible, each assignable but each an override.
   * For a driver role `others` still only contains certified drivers: that
   * requirement is not an override, it is a bar.
   */
  async getCandidates(
    scheduleId: string,
    date: string,
    slot: number,
    roleId?: string,
  ): Promise<ScheduleCandidatesResponse> {
    const context = await this.schedules.loadContext(scheduleId);
    const shift = this.assertShift(context, date, slot);
    const role = roleId ? this.assertRole(context, roleId) : null;

    const [roster, submissions, declined, assignments] = await Promise.all([
      this.prisma.user.findMany({
        where: { isActive: true, role: { in: availabilityEligibleRoles() as never[] } },
        select: PERSON_SELECT,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      }),
      this.prisma.availabilitySubmission.findMany({
        where: { windowId: context.window.id, date: parseDate(date), slot },
        select: { userId: true },
      }),
      this.schedules.loadDeclinedUserIds(context.window.id),
      this.prisma.scheduleAssignment.findMany({
        where: { scheduleId },
        include: { role: { select: { name: true } } },
      }),
    ]);

    const submittedForShift = new Set(submissions.map((row) => row.userId));
    const dutyCounts = new Map<string, number>();
    const onThisShift = new Map<string, string | null>();
    const byUserAndDate = new Map<string, Array<{ slot: number }>>();

    for (const assignment of assignments) {
      dutyCounts.set(assignment.userId, (dutyCounts.get(assignment.userId) ?? 0) + 1);
      const assignmentDate = toIsoDate(assignment.date);
      if (assignmentDate === date && assignment.slot === slot) {
        onThisShift.set(assignment.userId, assignment.role?.name ?? null);
      }
      const key = `${assignment.userId}#${assignmentDate}`;
      const bucket = byUserAndDate.get(key) ?? [];
      bucket.push({ slot: assignment.slot });
      byUserAndDate.set(key, bucket);
    }

    const available: ScheduleCandidate[] = [];
    const others: ScheduleCandidate[] = [];

    for (const person of roster) {
      const submitted = submittedForShift.has(person.id);

      // Left out of both lists rather than shown as unassignable: offering a
      // button that can only ever be refused is not a choice.
      if (role?.requiresDriverCertification && !person.isDriver) continue;

      const availability: AssignmentAvailability = submitted
        ? 'submitted'
        : declined.has(person.id)
          ? 'declined'
          : 'pending';

      const candidate: ScheduleCandidate = {
        ...person,
        availability,
        submittedForShift: submitted,
        alreadyOnShift: onThisShift.has(person.id),
        currentRoleName: onThisShift.get(person.id) ?? null,
        dutyCount: dutyCounts.get(person.id) ?? 0,
        conflictLabel: this.overlapLabel(context, byUserAndDate, person.id, date, shift),
      };

      if (submitted) available.push(candidate);
      else others.push(candidate);
    }

    // Fewest duties first inside each group, then by name: the fair pick is the
    // one at the top, and ties never reorder between reloads.
    const byLoadThenName = (a: ScheduleCandidate, b: ScheduleCandidate) =>
      a.dutyCount - b.dutyCount ||
      a.lastName.localeCompare(b.lastName) ||
      a.firstName.localeCompare(b.firstName);

    available.sort(byLoadThenName);
    others.sort(byLoadThenName);

    return { available, others };
  }

  /** An overlapping duty this person already holds on the same day, if any. */
  private overlapLabel(
    context: ScheduleContext,
    byUserAndDate: Map<string, Array<{ slot: number }>>,
    userId: string,
    date: string,
    shift: ShiftDefinition,
  ): string | null {
    const sameDay = byUserAndDate.get(`${userId}#${date}`) ?? [];
    for (const other of sameDay) {
      if (other.slot === shift.slot) continue;
      const otherShift = context.shifts.get(shiftKey(date, other.slot));
      if (otherShift && shiftsOverlap(shift, otherShift)) {
        return `Already on ${otherShift.label} this day`;
      }
    }
    return null;
  }

  /**
   * The shift must be one the window actually has that day. Reuses the window's
   * own grid rather than re-deriving it from the day type — the whole reason
   * `ShiftScheduleService` exists.
   */
  private assertShift(
    context: ScheduleContext,
    date: string,
    slot: number,
  ): ShiftDefinition & { date: string } {
    const day = context.pattern.find((entry) => entry.date === date);
    if (!day) {
      throw new BadRequestException(
        `${date} is outside ${availabilityWindowLabel(context.window)} ` +
          `(${context.window.startDate} – ${context.window.endDate})`,
      );
    }
    this.shiftSchedule.assertSlotValidForPattern(day, slot);
    return context.shifts.get(shiftKey(date, slot))!;
  }

  /**
   * A window with roles schedules people *into* one: leaving it out would make
   * the board unable to say where the person stands. A window with none takes
   * no role at all.
   */
  private assertRole(
    context: ScheduleContext,
    roleId: string | null,
  ): AvailabilityWindowRole | null {
    if (context.roles.length === 0) {
      if (roleId) {
        throw new BadRequestException(
          `${availabilityWindowLabel(context.window)} defines no roles — people are ` +
            'scheduled onto it without one.',
        );
      }
      return null;
    }

    if (!roleId) {
      throw new BadRequestException(
        `roleId is required: this window defines ${context.roles
          .map((role) => role.name)
          .join(', ')}.`,
      );
    }

    const role = context.roles.find((entry) => entry.id === roleId);
    if (!role) {
      throw new BadRequestException(
        `Role ${roleId} does not belong to ${availabilityWindowLabel(context.window)}`,
      );
    }
    return role;
  }
}

/** `@db.Date` columns round-trip through UTC midnight — never local midnight. */
function parseDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}
