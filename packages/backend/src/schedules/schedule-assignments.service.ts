import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ApiBadRequestException,
  ApiConflictException,
  ApiForbiddenException,
} from '../common/api-error.exception';
import {
  AssignmentAvailability,
  AvailabilityWindowRole,
  availabilityEligibleRoles,
  availabilityWindowLabel,
  CERTIFICATION_LABEL,
  formatRoleCapacity,
  holdsCertification,
  ScheduleAssignment,
  ScheduleCandidate,
  ScheduleCandidatesResponse,
  ScheduleStatus,
  ShiftDefinition,
  roleCanTakeMore,
  shiftsOverlap,
} from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ShiftScheduleService } from '../availability/shift-schedule.service';
import { toIsoDate } from '../utils/date.util';
import {
  CERT_HELD_SELECT,
  today,
  toHeldCertifications,
  toSchedulePerson,
} from '../users/certifications.util';
import { CreateScheduleAssignmentDto, SelfAssignDto } from './dto/create-assignment.dto';
import {
  ScheduleContext,
  SchedulesService,
  serializeAssignment,
  shiftKey,
} from './schedules.service';

const ASSIGNMENT_INCLUDE = {
  user: { select: { id: true, firstName: true, lastName: true, certifications: { select: CERT_HELD_SELECT } } },
  role: true,
  assignedBy: { select: { id: true, firstName: true, lastName: true } },
} as const;

const PERSON_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  certifications: { select: CERT_HELD_SELECT },
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
 * A post's `requiredCertification` is enforceable, not absolute: a coordinator
 * may still assign someone who lacks it, but only with a reason, recorded as
 * `certificationOverrideReason`. Self-assignment has no such door — see
 * `selfAssignBlockedReason` (shared).
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
      select: { ...PERSON_SELECT, isActive: true, roles: true },
    });
    if (!person) throw new NotFoundException(`User ${dto.userId} not found`);
    const personName = `${person.firstName} ${person.lastName}`;
    if (!person.isActive) {
      throw new ApiBadRequestException(
        'ASSIGNMENT_PERSON_INACTIVE',
        `${personName} is not an active member and cannot be scheduled.`,
        { person: personName },
      );
    }
    const eligibleRoles = availabilityEligibleRoles();
    if (!person.roles.some((role) => eligibleRoles.includes(role as never))) {
      throw new ApiBadRequestException(
        'ASSIGNMENT_PERSON_NOT_FIELD_PERSONNEL',
        `${personName} is not field personnel and cannot be scheduled.`,
        { person: personName },
      );
    }

    // Every requirement is overridable, the driver post included — but never
    // without a reason, recorded on the assignment rather than merely implied
    // by it existing.
    const overrideReason = dto.overrideReason?.trim() || undefined;
    const meetsRequirement =
      !role?.requiredCertification ||
      holdsCertification(toHeldCertifications(person.certifications), role.requiredCertification, today());
    if (!meetsRequirement && !overrideReason) {
      const certification = CERTIFICATION_LABEL[role!.requiredCertification!];
      throw new ApiBadRequestException(
        'ASSIGNMENT_CERTIFICATION_REQUIRED',
        `${role!.name} requires the ${certification} certification, ` +
          `which ${personName} does not hold. Assigning them needs a reason.`,
        { role: role!.name, certification, person: personName },
      );
    }

    const onShift = await this.prisma.scheduleAssignment.findMany({
      where: { scheduleId, date: parseDate(dto.date), slot: dto.slot },
      include: { role: true, user: { select: PERSON_SELECT } },
    });

    const already = onShift.find((row) => row.userId === dto.userId);
    if (already) {
      throw new ApiConflictException(
        'ASSIGNMENT_ALREADY_ON_SHIFT',
        `${personName} is already on this shift` +
          (already.role ? ` as ${already.role.name}` : '') +
          ' — one person cannot hold two places on one shift.',
        { person: personName, role: already.role?.name ?? '' },
      );
    }

    if (role) {
      const filled = onShift.filter((row) => row.roleId === role.id).length;
      if (!roleCanTakeMore(role, filled)) {
        const capacity = formatRoleCapacity(role.maxPeople);
        throw new ApiConflictException(
          'ASSIGNMENT_ROLE_FULL',
          `${role.name} is full on this shift (${capacity}). Remove someone first, or use another role.`,
          { role: role.name, capacity },
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
        certificationOverrideReason: meetsRequirement ? null : (overrideReason as string),
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

  /**
   * Someone adding *themselves* to a published schedule.
   *
   * A published rota is posted to the whole platform, and anyone who sees an
   * open place they can cover may take it. Three things make this safe to hand
   * to every member rather than only to coordinators:
   *
   *  - the caller is always the subject, so nobody can be volunteered by
   *    someone else;
   *  - the schedule has to be published, so nobody walks into a draft;
   *  - every rule a coordinator is held to still applies, the driver
   *    certification above all.
   *
   * It is deliberately one-way: filling an open place is the member's to do,
   * vacating it is not. Coming off a rota other people are relying on goes
   * through a coordinator, who can find the replacement at the same time.
   */
  async selfAssign(
    scheduleId: string,
    dto: SelfAssignDto,
    user: { id: string },
  ): Promise<ScheduleAssignment> {
    const context = await this.schedules.loadContext(scheduleId);
    if (context.status !== ScheduleStatus.PUBLISHED) {
      throw new ApiForbiddenException(
        'SELF_ASSIGN_SCHEDULE_NOT_PUBLISHED',
        'This schedule has not been published yet, so it is not open to sign up to.',
      );
    }

    const shift = this.assertShift(context, dto.date, dto.slot);

    // Their own duties elsewhere on this schedule: a coordinator may knowingly
    // create a clash mid-swap, but nobody should be able to double-book
    // themselves by accident.
    const own = await this.prisma.scheduleAssignment.findMany({
      where: { scheduleId, userId: user.id },
      select: { date: true, slot: true },
    });
    for (const other of own) {
      const otherDate = toIsoDate(other.date);
      if (otherDate !== dto.date || other.slot === dto.slot) continue;
      const otherShift = context.shifts.get(shiftKey(otherDate, other.slot));
      if (otherShift && shiftsOverlap(shift, otherShift)) {
        throw new ApiConflictException(
          'SELF_ASSIGN_OVERLAPPING_SHIFT',
          `You are already on ${otherShift.label} that day, which overlaps this shift.`,
          { shift: otherShift.label },
        );
      }
    }

    return this.assign(scheduleId, { ...dto, userId: user.id }, user.id);
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
   * Nobody is excluded for lacking the role's `requiredCertification` — every
   * requirement is overridable now, so the client checks each candidate's own
   * `certifications` against it and flags rather than hides them.
   */
  async getCandidates(
    scheduleId: string,
    date: string,
    slot: number,
    roleId?: string,
  ): Promise<ScheduleCandidatesResponse> {
    const context = await this.schedules.loadContext(scheduleId);
    const shift = this.assertShift(context, date, slot);
    // Validates roleId belongs to this window; nothing further is read from it.
    if (roleId) this.assertRole(context, roleId);

    const [roster, submissions, declined, assignments] = await Promise.all([
      this.prisma.user.findMany({
        where: { isActive: true, roles: { hasSome: availabilityEligibleRoles() as never[] } },
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
    const asOf = today();

    for (const personRow of roster) {
      const person = toSchedulePerson(personRow, asOf);
      const submitted = submittedForShift.has(person.id);

      // No longer excluded when a role has a requirement they lack — every
      // requirement is now overridable, so they are listed and flagged
      // instead. `ScheduleCandidate.certifications` (via `SchedulePerson`)
      // is what the assign dialog checks against `role.requiredCertification`.

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
      const windowLabel = availabilityWindowLabel(context.window);
      throw new ApiBadRequestException(
        'ASSIGNMENT_DATE_OUTSIDE_WINDOW',
        `${date} is outside ${windowLabel} (${context.window.startDate} – ${context.window.endDate})`,
        { date, window: windowLabel, startDate: context.window.startDate, endDate: context.window.endDate },
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
        const windowLabel = availabilityWindowLabel(context.window);
        throw new ApiBadRequestException(
          'ASSIGNMENT_WINDOW_HAS_NO_ROLES',
          `${windowLabel} defines no roles — people are scheduled onto it without one.`,
          { window: windowLabel },
        );
      }
      return null;
    }

    if (!roleId) {
      const roleNames = context.roles.map((role) => role.name).join(', ');
      throw new ApiBadRequestException(
        'ASSIGNMENT_ROLE_ID_REQUIRED',
        `roleId is required: this window defines ${roleNames}.`,
        { roles: roleNames },
      );
    }

    const role = context.roles.find((entry) => entry.id === roleId);
    if (!role) {
      const windowLabel = availabilityWindowLabel(context.window);
      throw new ApiBadRequestException(
        'ASSIGNMENT_ROLE_NOT_IN_WINDOW',
        `Role ${roleId} does not belong to ${windowLabel}`,
        { window: windowLabel },
      );
    }
    return role;
  }
}

/** `@db.Date` columns round-trip through UTC midnight — never local midnight. */
function parseDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}
