import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ApproveVolunteerHoursBatchResponse,
  AvailabilityWindowCategory,
  CreateManualVolunteerHoursRequest,
  MyVolunteerHoursResponse,
  ShiftDefinition,
  ShiftExceptionAssignment,
  ShiftExceptionReport,
  ShiftTimes,
  SweepApproveVolunteerHoursResponse,
  UpdateVolunteerHoursRequest,
  VolunteerActivityType,
  VolunteerHoursActor,
  VolunteerHoursEntry as VolunteerHoursEntryShape,
  VolunteerHoursFlag,
  VolunteerHoursFlagDetail,
  VolunteerHoursReviewResponse,
  VolunteerHoursSource,
  VolunteerHoursStatus,
  applyShiftOverrides,
  canDeleteOwnVolunteerHours,
  canReopenVolunteerHours,
  detectShiftExceptions,
  isEligibleForAutoApproval,
  isSweepApprovable,
  proposeScheduledHours,
  shiftMandatoryRolesFilled,
  validateManualVolunteerHours,
  validateVolunteerHoursEdit,
} from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ShiftScheduleService } from '../availability/shift-schedule.service';
import { shiftKey } from '../schedules/schedules.service';
import { parseIsoDate, toIsoDate } from '../utils/date.util';
import { shiftBoundaryToInstant } from '../utils/timezone.util';
import { CreateManualVolunteerHoursDto } from './dto/create-manual-hours.dto';
import { UpdateVolunteerHoursDto } from './dto/update-hours.dto';
import { ApproveVolunteerHoursDto } from './dto/approve-hours.dto';
import { ReviewVolunteerHoursQueryDto } from './dto/review-query.dto';
import { ApproveVolunteerHoursBatchDto } from './dto/approve-hours-batch.dto';
import { SweepApproveVolunteerHoursDto } from './dto/sweep-approve.dto';
import { DismissVolunteerHoursDto } from './dto/dismiss-hours.dto';

const ACTOR_SELECT = { select: { id: true, firstName: true, lastName: true } } as const;

const ENTRY_INCLUDE = {
  user: ACTOR_SELECT,
  approvedBy: ACTOR_SELECT,
  loggedBy: ACTOR_SELECT,
  reopenedBy: ACTOR_SELECT,
  deletedBy: ACTOR_SELECT,
} as const;

type EntryRow = Prisma.VolunteerHoursEntryGetPayload<{ include: typeof ENTRY_INCLUDE }>;

/**
 * Volunteer hours (#164): the default is "time on a published, properly
 * crewed shift is time worked", auto-generated with no one having to ask for
 * it; a person corrects it, or a coordinator approves/corrects it, only for
 * the exceptions.
 *
 * Generation is lazy — the first read that would need a not-yet-materialised
 * entry creates it — rather than a timer sweep, following the same argument
 * `identity-purge.service.ts` makes about a different cleanup job: a job that
 * runs occasionally must never be the thing that makes "is this entry here
 * yet" a correctness question. Every entry point below (`getMyHours`,
 * `getReviewQueue`, the summary) calls `ensureGenerated` first for exactly
 * that reason, and every entry point also sweeps auto-approval — so a
 * grace-period entry becomes final the next time *anyone* looks, not on a
 * clock.
 */
@Injectable()
export class VolunteerHoursService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shiftSchedule: ShiftScheduleService,
  ) {}

  // ── Self-service ──────────────────────────────────────────────────────────

  async getMyHours(userId: string): Promise<MyVolunteerHoursResponse> {
    await this.refreshGeneration();

    const rows = await this.prisma.volunteerHoursEntry.findMany({
      where: { userId, deletedAt: null },
      include: ENTRY_INCLUDE,
      orderBy: [{ date: 'desc' }],
    });

    return {
      entries: rows.map(serializeEntry),
      totalApprovedMinutes: sumMinutes(rows, VolunteerHoursStatus.APPROVED),
      totalPendingMinutes: sumMinutes(rows, VolunteerHoursStatus.PENDING),
    };
  }

  async createManualEntry(
    userId: string,
    dto: CreateManualVolunteerHoursDto,
  ): Promise<VolunteerHoursEntryShape> {
    const request: CreateManualVolunteerHoursRequest = dto;
    const error = validateManualVolunteerHours(request);
    if (error) throw new BadRequestException(error);

    const row = await this.prisma.volunteerHoursEntry.create({
      data: {
        userId,
        source: VolunteerHoursSource.MANUAL,
        activityType: dto.activityType,
        date: parseIsoDate(dto.date),
        description: dto.description?.trim() || null,
        proposedMinutes: dto.minutes,
        minutes: dto.minutes,
        loggedById: userId,
      },
      include: ENTRY_INCLUDE,
    });
    return serializeEntry(row);
  }

  /**
   * The owner correcting their own entry — auto-generated or logged by hand
   * — while it is still PENDING. Once a coordinator (or auto-approval) has
   * moved it to APPROVED it is final, per the same "approve or correct the
   * number" design the review queue uses: there is no re-opening an entry
   * from here, only from `approve`.
   */
  async updateMine(
    id: string,
    userId: string,
    dto: UpdateVolunteerHoursDto,
  ): Promise<VolunteerHoursEntryShape> {
    const existing = await this.prisma.volunteerHoursEntry.findUnique({ where: { id } });
    // Same 404 whether the entry doesn't exist or belongs to someone else —
    // this is a self-service endpoint, not a lookup one.
    if (!existing || existing.userId !== userId) {
      throw new NotFoundException('No such volunteer-hours entry.');
    }
    if (existing.status !== VolunteerHoursStatus.PENDING) {
      throw new BadRequestException('Only a pending entry can still be edited.');
    }

    const source = existing.source as VolunteerHoursSource;
    const request: UpdateVolunteerHoursRequest = dto;
    const error = validateVolunteerHoursEdit(
      request,
      source,
      existing.activityType as VolunteerActivityType,
    );
    if (error) throw new BadRequestException(error);

    const isManual = source === VolunteerHoursSource.MANUAL;
    const row = await this.prisma.volunteerHoursEntry.update({
      where: { id },
      data: {
        minutes: dto.minutes,
        ...(isManual
          ? {
              activityType: dto.activityType ?? existing.activityType,
              date: dto.date ? parseIsoDate(dto.date) : existing.date,
              description: (dto.description ?? existing.description ?? '').trim() || null,
            }
          : {
              description:
                dto.description !== undefined ? dto.description.trim() || null : existing.description,
            }),
      },
      include: ENTRY_INCLUDE,
    });
    return serializeEntry(row);
  }

  // ── Coordinator review ───────────────────────────────────────────────────

  /**
   * The filterable, paginated queue that replaced the old flat `/pending`
   * list. Counts are computed over the current status/range/search scope but
   * *ignoring* `flag`/`source`, so each filter chip can show how many
   * entries it would reveal without the query re-running per chip.
   */
  async getReviewQueue(query: ReviewVolunteerHoursQueryDto): Promise<VolunteerHoursReviewResponse> {
    await this.refreshGeneration();

    const status = query.status ?? VolunteerHoursStatus.PENDING;
    const page = query.page ?? 1;
    const perPage = query.perPage ?? 25;
    const sort = query.sort ?? 'date';
    const order = query.order ?? 'asc';
    const search = query.search?.trim();

    const dateRange = buildDateRangeFilter(query.from, query.to);
    const scopeWhere: Prisma.VolunteerHoursEntryWhereInput = {
      deletedAt: null,
      status,
      ...(dateRange ? { date: dateRange } : {}),
      ...(search
        ? {
            OR: [
              { user: { firstName: { contains: search, mode: 'insensitive' } } },
              { user: { lastName: { contains: search, mode: 'insensitive' } } },
              { description: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const queueWhere: Prisma.VolunteerHoursEntryWhereInput = {
      ...scopeWhere,
      ...(query.flag === 'NONE'
        ? { flags: { isEmpty: true } }
        : query.flag
          ? { flags: { has: query.flag } }
          : {}),
      ...(query.source ? { source: query.source } : {}),
    };

    // Fixed definition (mirrors `isSweepApprovable`), not the current
    // status/search scope — the sweep only ever targets PENDING, unflagged,
    // SCHEDULED entries, regardless of which tab or search is active.
    const sweepableWhere: Prisma.VolunteerHoursEntryWhereInput = {
      deletedAt: null,
      reopenedAt: null,
      source: VolunteerHoursSource.SCHEDULED,
      status: VolunteerHoursStatus.PENDING,
      flags: { isEmpty: true },
      ...(dateRange ? { date: dateRange } : {}),
    };

    const [data, total, all, noFlags, ranOver, possiblyLeftEarly, manual, sweepable, aggregates] =
      await this.prisma.$transaction([
        this.prisma.volunteerHoursEntry.findMany({
          where: queueWhere,
          include: ENTRY_INCLUDE,
          orderBy: buildReviewOrderBy(sort, order),
          skip: (page - 1) * perPage,
          take: perPage,
        }),
        this.prisma.volunteerHoursEntry.count({ where: queueWhere }),
        this.prisma.volunteerHoursEntry.count({ where: scopeWhere }),
        this.prisma.volunteerHoursEntry.count({ where: { ...scopeWhere, flags: { isEmpty: true } } }),
        this.prisma.volunteerHoursEntry.count({
          where: { ...scopeWhere, flags: { has: 'RAN_OVER' } },
        }),
        this.prisma.volunteerHoursEntry.count({
          where: { ...scopeWhere, flags: { has: 'POSSIBLY_LEFT_EARLY' } },
        }),
        this.prisma.volunteerHoursEntry.count({
          where: { ...scopeWhere, source: VolunteerHoursSource.MANUAL },
        }),
        this.prisma.volunteerHoursEntry.count({ where: sweepableWhere }),
        this.prisma.volunteerHoursEntry.aggregate({
          where: scopeWhere,
          _sum: { proposedMinutes: true },
          _min: { date: true },
        }),
      ]);

    return {
      data: data.map(serializeEntry),
      total,
      page,
      perPage,
      counts: {
        all,
        noFlags,
        ranOver,
        possiblyLeftEarly,
        manual,
        sweepable,
        totalProposedMinutes: aggregates._sum.proposedMinutes ?? 0,
        oldestDate: aggregates._min.date ? toIsoDate(aggregates._min.date) : null,
      },
    };
  }

  async approve(
    id: string,
    approverId: string,
    dto: ApproveVolunteerHoursDto,
  ): Promise<VolunteerHoursEntryShape> {
    const row = await this.prisma.$transaction((tx) =>
      this.approveOne(tx, id, approverId, dto.minutes, dto.correctionReason),
    );
    return serializeEntry(row);
  }

  /**
   * `POST /approve-batch` — deliberately tolerant: one entry a colleague
   * approved a second earlier must not fail the other 39. Each item runs in
   * its own transaction so one failure can't roll back the rest.
   */
  async approveBatch(
    dto: ApproveVolunteerHoursBatchDto,
    approverId: string,
  ): Promise<ApproveVolunteerHoursBatchResponse> {
    const approved: VolunteerHoursEntryShape[] = [];
    const failed: { id: string; message: string }[] = [];

    for (const item of dto.entries) {
      try {
        const row = await this.prisma.$transaction((tx) =>
          this.approveOne(tx, item.id, approverId, item.minutes, item.correctionReason),
        );
        approved.push(serializeEntry(row));
      } catch (error) {
        failed.push({ id: item.id, message: messageOf(error) });
      }
    }

    return { approved, failed };
  }

  /**
   * The "approve all without exceptions" sweep. Re-checks each candidate
   * through `isSweepApprovable` — the same predicate the frontend's button
   * count uses — rather than trusting the query's own `where` back as fact,
   * for the same reason `autoApproveEligible` does below.
   */
  async sweepApprove(
    dto: SweepApproveVolunteerHoursDto,
    approverId: string,
  ): Promise<SweepApproveVolunteerHoursResponse> {
    await this.refreshGeneration();

    const dateRange = buildDateRangeFilter(dto.from, dto.to);
    const candidates = await this.prisma.volunteerHoursEntry.findMany({
      where: {
        deletedAt: null,
        reopenedAt: null,
        source: VolunteerHoursSource.SCHEDULED,
        status: VolunteerHoursStatus.PENDING,
        flags: { isEmpty: true },
        ...(dateRange ? { date: dateRange } : {}),
      },
      select: {
        id: true,
        proposedMinutes: true,
        source: true,
        status: true,
        flags: true,
        reopenedAt: true,
        deletedAt: true,
      },
    });

    const eligible = candidates.filter((entry) =>
      isSweepApprovable({
        source: entry.source as VolunteerHoursSource,
        status: entry.status as VolunteerHoursStatus,
        flags: entry.flags as VolunteerHoursFlag[],
        reopenedAt: entry.reopenedAt ? entry.reopenedAt.toISOString() : null,
        deletedAt: entry.deletedAt ? entry.deletedAt.toISOString() : null,
      }),
    );
    if (eligible.length === 0) return { approvedCount: 0, totalMinutes: 0 };

    await this.prisma.volunteerHoursEntry.updateMany({
      where: { id: { in: eligible.map((entry) => entry.id) } },
      data: {
        status: VolunteerHoursStatus.APPROVED,
        approvedById: approverId,
        approvedAt: new Date(),
        autoApproved: false,
      },
    });

    return {
      approvedCount: eligible.length,
      totalMinutes: eligible.reduce((total, entry) => total + entry.proposedMinutes, 0),
    };
  }

  /** `POST /:id/reopen` — send an APPROVED entry back to PENDING. */
  async reopen(id: string, actorId: string): Promise<VolunteerHoursEntryShape> {
    const existing = await this.prisma.volunteerHoursEntry.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('No such volunteer-hours entry.');
    if (
      !canReopenVolunteerHours({
        status: existing.status as VolunteerHoursStatus,
        deletedAt: existing.deletedAt ? existing.deletedAt.toISOString() : null,
      })
    ) {
      throw new BadRequestException('Only an approved entry can be reopened.');
    }

    const row = await this.prisma.volunteerHoursEntry.update({
      where: { id },
      data: {
        status: VolunteerHoursStatus.PENDING,
        minutes: existing.proposedMinutes,
        correctionReason: null,
        approvedById: null,
        approvedAt: null,
        autoApproved: false,
        reopenedAt: new Date(),
        reopenedById: actorId,
      },
      include: ENTRY_INCLUDE,
    });
    return serializeEntry(row);
  }

  /** `POST /:id/dismiss` — a coordinator soft-deleting an entry that should not exist at all. */
  async dismiss(
    id: string,
    actorId: string,
    dto: DismissVolunteerHoursDto,
  ): Promise<VolunteerHoursEntryShape> {
    const existing = await this.prisma.volunteerHoursEntry.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('No such volunteer-hours entry.');
    if (existing.deletedAt) throw new BadRequestException('This entry was already dismissed.');

    const row = await this.prisma.volunteerHoursEntry.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedById: actorId,
        deletionReason: dto.reason.trim(),
      },
      include: ENTRY_INCLUDE,
    });
    return serializeEntry(row);
  }

  /** `POST /:id/restore` — undo a `dismiss`. */
  async restore(id: string): Promise<VolunteerHoursEntryShape> {
    const existing = await this.prisma.volunteerHoursEntry.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('No such volunteer-hours entry.');
    if (!existing.deletedAt) throw new BadRequestException('This entry is not dismissed.');

    const row = await this.prisma.volunteerHoursEntry.update({
      where: { id },
      data: { deletedAt: null, deletedById: null, deletionReason: null },
      include: ENTRY_INCLUDE,
    });
    return serializeEntry(row);
  }

  /**
   * `DELETE /:id` — a volunteer deleting their own mistake. Mirrors
   * `updateMine`'s ownership guard exactly: the same 404 whether the entry is
   * missing or someone else's.
   */
  async deleteMine(id: string, userId: string): Promise<void> {
    const existing = await this.prisma.volunteerHoursEntry.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      throw new NotFoundException('No such volunteer-hours entry.');
    }
    if (
      !canDeleteOwnVolunteerHours(
        {
          userId: existing.userId,
          source: existing.source as VolunteerHoursSource,
          status: existing.status as VolunteerHoursStatus,
          deletedAt: existing.deletedAt ? existing.deletedAt.toISOString() : null,
        },
        userId,
      )
    ) {
      throw new BadRequestException('Only your own pending manual entry can be deleted.');
    }

    await this.prisma.volunteerHoursEntry.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: userId },
    });
  }

  /**
   * Shared body behind `approve` and `approveBatch`, run inside a
   * transaction so a batch item's read-then-write can't race a colleague's.
   */
  private async approveOne(
    tx: Prisma.TransactionClient,
    id: string,
    approverId: string,
    minutes: number | undefined,
    correctionReason: string | undefined,
  ) {
    const existing = await tx.volunteerHoursEntry.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('No such volunteer-hours entry.');
    if (existing.deletedAt) throw new BadRequestException('This entry was dismissed.');
    if (existing.status === VolunteerHoursStatus.APPROVED) {
      throw new BadRequestException('This entry is already approved.');
    }

    const resolvedMinutes = minutes ?? existing.proposedMinutes;
    const corrected = resolvedMinutes !== existing.proposedMinutes;
    if (corrected && !correctionReason?.trim()) {
      throw new BadRequestException('Correcting the minutes needs a reason.');
    }

    return tx.volunteerHoursEntry.update({
      where: { id },
      data: {
        minutes: resolvedMinutes,
        status: VolunteerHoursStatus.APPROVED,
        approvedById: approverId,
        approvedAt: new Date(),
        autoApproved: false,
        correctionReason: corrected ? correctionReason!.trim() : null,
      },
      include: ENTRY_INCLUDE,
    });
  }

  // ── Generation ────────────────────────────────────────────────────────────

  /**
   * Generates any not-yet-materialised entries, then sweeps auto-approval.
   * Public so the summary/CSV path (`VolunteerHoursSummaryService`) can bring
   * the data up to date before reading it, without duplicating the lazy-
   * generation logic itself.
   */
  async refreshGeneration(today = toIsoDate(new Date())): Promise<void> {
    await this.ensureGenerated(today);
    await this.autoApproveEligible(today);
  }

  /**
   * Auto-generates a `SCHEDULED` entry for every past, published assignment
   * that does not have one yet. Grouped by shift rather than by assignment: a
   * shift's mandatory roles and its exceptions are properties of the whole
   * crew, not of one person on it, and an undercrewed shift must generate
   * nothing for *anyone* on it (it most likely did not run) rather than
   * something-plus-a-flag.
   */
  private async ensureGenerated(today = toIsoDate(new Date())): Promise<void> {
    // Deliberately not filtered on `deletedAt` here: a dismissed entry is a
    // retained row, so `volunteerHoursEntry: null` already excludes its
    // assignment from "pending" — that retained row is exactly what stops a
    // dismissed SCHEDULED entry from being regenerated on the next read.
    const pending = await this.prisma.scheduleAssignment.findMany({
      where: {
        volunteerHoursEntry: null,
        date: { lt: parseIsoDate(today) },
        schedule: { status: 'PUBLISHED' },
      },
      select: { scheduleId: true, date: true, slot: true },
      distinct: ['scheduleId', 'date', 'slot'],
    });
    if (pending.length === 0) return;

    // Per-schedule caches: the pattern and its overrides are the same for
    // every shift of the same schedule, and several pending shifts often
    // belong to one.
    const patternCache = new Map<string, ShiftDefinition[]>();
    const overrideCache = new Map<string, Map<string, ShiftTimes>>();

    for (const { scheduleId, date, slot } of pending) {
      const isoDate = toIsoDate(date);
      await this.generateForShift(scheduleId, isoDate, slot, patternCache, overrideCache);
    }
  }

  private async generateForShift(
    scheduleId: string,
    date: string,
    slot: number,
    patternCache: Map<string, ShiftDefinition[]>,
    overrideCache: Map<string, Map<string, ShiftTimes>>,
  ): Promise<void> {
    const assignments = await this.prisma.scheduleAssignment.findMany({
      where: { scheduleId, date: parseIsoDate(date), slot },
      include: { role: true },
    });
    // Someone else's read may have generated this shift already since the
    // pending list was loaded.
    const missing = await this.prisma.volunteerHoursEntry.findMany({
      where: { assignmentId: { in: assignments.map((a) => a.id) } },
      select: { assignmentId: true },
    });
    const alreadyGenerated = new Set(missing.map((m) => m.assignmentId));
    const toGenerate = assignments.filter((a) => !alreadyGenerated.has(a.id));
    if (toGenerate.length === 0) return;

    const schedule = await this.prisma.schedule.findUnique({
      where: { id: scheduleId },
      include: { window: { include: { roles: true } } },
    });
    if (!schedule) return;
    const { window } = schedule;

    if (
      !shiftMandatoryRolesFilled({
        roles: window.roles,
        assignments,
      })
    ) {
      // The shift most likely did not run: nothing is generated for anyone
      // on it, flagged or otherwise.
      return;
    }

    const shift = await this.resolveShiftTimes(
      scheduleId,
      window.id,
      toIsoDate(window.startDate),
      toIsoDate(window.endDate),
      date,
      slot,
      patternCache,
      overrideCache,
    );
    // A shift the window's own grid no longer describes cannot be timed —
    // nothing to generate rather than inventing hours.
    if (!shift) return;

    const baselineMinutes = shift.endMinute - shift.startMinute;
    const category = window.category as AvailabilityWindowCategory;

    let extraMinutesByUser = new Map<string, number>();
    let possiblyLeftEarly = new Set<string>();
    if (category === AvailabilityWindowCategory.EMERGENCY) {
      const exceptions = await this.detectExceptionsForShift(
        scheduleId,
        date,
        slot,
        shift.endMinute,
        window.roles,
        assignments,
      );
      extraMinutesByUser = exceptions.extraMinutesByUser;
      possiblyLeftEarly = exceptions.possiblyLeftEarly;
    }

    for (const assignment of toGenerate) {
      const extraMinutes = extraMinutesByUser.get(assignment.userId) ?? 0;
      const { proposedMinutes, flags } = proposeScheduledHours({
        baselineMinutes,
        extraMinutes,
        possiblyLeftEarly: possiblyLeftEarly.has(assignment.userId),
      });
      const flagDetails: VolunteerHoursFlagDetail[] = flags.map((flag) =>
        flag === 'RAN_OVER' ? { flag, minutesOver: extraMinutes } : { flag },
      );

      try {
        await this.prisma.volunteerHoursEntry.create({
          data: {
            userId: assignment.userId,
            source: VolunteerHoursSource.SCHEDULED,
            activityType: category as unknown as VolunteerActivityType,
            assignmentId: assignment.id,
            scheduleId,
            date: parseIsoDate(date),
            baselineMinutes,
            proposedMinutes,
            minutes: proposedMinutes,
            flags,
            flagDetails:
              flagDetails.length > 0
                ? (flagDetails as unknown as Prisma.InputJsonValue)
                : undefined,
          },
        });
      } catch (error) {
        // Generation is lazy and runs on every read with no lock between the
        // "not yet generated" check and the write — two concurrent reads
        // (two people opening /my-hours at once, or /me racing the review
        // queue) can both decide the same assignment needs an entry. The
        // loser of that race hits the unique constraint on `assignmentId`;
        // that is the other request having already done this job, not a
        // failure worth surfacing.
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
          throw error;
        }
      }
    }
  }

  private async resolveShiftTimes(
    scheduleId: string,
    windowId: string,
    startDate: string,
    endDate: string,
    date: string,
    slot: number,
    patternCache: Map<string, ShiftDefinition[]>,
    overrideCache: Map<string, Map<string, ShiftTimes>>,
  ): Promise<ShiftDefinition | null> {
    let overrides = overrideCache.get(scheduleId);
    if (!overrides) {
      const rows = await this.prisma.scheduleShiftOverride.findMany({ where: { scheduleId } });
      overrides = new Map(
        rows.map((row) => [
          shiftKey(toIsoDate(row.date), row.slot),
          { startMinute: row.startMinute, endMinute: row.endMinute },
        ]),
      );
      overrideCache.set(scheduleId, overrides);
    }

    const cacheKey = `${windowId}#${scheduleId}`;
    let shifts = patternCache.get(cacheKey);
    if (!shifts) {
      const rawPattern = await this.shiftSchedule.getPatternForWindow({
        id: windowId,
        startDate,
        endDate,
      });
      const pattern = applyShiftOverrides(rawPattern, overrides);
      shifts = pattern.flatMap((day) =>
        day.shifts.map((shift) => ({ ...shift, date: day.date }) as ShiftDefinition & {
          date: string;
        }),
      );
      patternCache.set(cacheKey, shifts);
    }

    return (
      (shifts as Array<ShiftDefinition & { date: string }>).find(
        (shift) => shift.date === date && shift.slot === slot,
      ) ?? null
    );
  }

  /**
   * The two exception signals for one Emergency shift: reports (submitted or
   * still a draft) joined back via `(scheduleId, shiftDate, shiftSlot)` — the
   * same coordinates `ScheduleAssignment` uses, kept on `EventReport` for
   * exactly this join.
   */
  private async detectExceptionsForShift(
    scheduleId: string,
    date: string,
    slot: number,
    shiftEndMinute: number,
    roles: Array<{ id: string; mandatoryCount: number }>,
    assignments: Array<{ userId: string; roleId: string | null }>,
  ): Promise<{ extraMinutesByUser: Map<string, number>; possiblyLeftEarly: Set<string> }> {
    const reports = await this.prisma.eventReport.findMany({
      where: { type: 'EMERGENCY', scheduleId, shiftDate: parseIsoDate(date), shiftSlot: slot },
      include: { crew: { select: { userId: true } } },
    });
    if (reports.length === 0) return { extraMinutesByUser: new Map(), possiblyLeftEarly: new Set() };

    const shiftEndInstant = shiftBoundaryToInstant(date, shiftEndMinute);
    const roleById = new Map(roles.map((role) => [role.id, role]));

    const reportInputs: ShiftExceptionReport[] = reports.map((report) => {
      const timestamps = [report.availableAt, report.endedAt, report.hospitalArrivalAt].filter(
        (value): value is Date => value !== null,
      );
      const minutesPastShiftEnd =
        timestamps.length === 0
          ? 0
          : Math.round(
              (Math.max(...timestamps.map((t) => t.getTime())) - shiftEndInstant.getTime()) /
                60_000,
            );
      return {
        submitted: report.submittedAt !== null,
        minutesPastShiftEnd,
        crewUserIds: report.crew.map((c) => c.userId),
      };
    });

    const assignmentInputs: ShiftExceptionAssignment[] = assignments.map((assignment) => ({
      userId: assignment.userId,
      roleMandatoryCount: assignment.roleId
        ? (roleById.get(assignment.roleId)?.mandatoryCount ?? null)
        : null,
    }));

    return detectShiftExceptions({ assignments: assignmentInputs, reports: reportInputs });
  }

  private async autoApproveEligible(today = toIsoDate(new Date())): Promise<void> {
    // The `where` narrows to exactly the rows that *could* be eligible, but
    // `isEligibleForAutoApproval` is still given each row's own `source` and
    // `status` rather than the constants used to query for them — reading
    // the query's own filter back as fact would make this silently wrong the
    // moment the `where` below is ever loosened.
    const candidates = await this.prisma.volunteerHoursEntry.findMany({
      where: {
        source: VolunteerHoursSource.SCHEDULED,
        status: VolunteerHoursStatus.PENDING,
        deletedAt: null,
      },
      select: {
        id: true,
        date: true,
        flags: true,
        source: true,
        status: true,
        reopenedAt: true,
        deletedAt: true,
      },
    });
    const eligibleIds = candidates
      .filter((entry) =>
        isEligibleForAutoApproval(
          {
            source: entry.source as VolunteerHoursSource,
            status: entry.status as VolunteerHoursStatus,
            flags: entry.flags as VolunteerHoursFlag[],
            date: toIsoDate(entry.date),
            reopenedAt: entry.reopenedAt ? entry.reopenedAt.toISOString() : null,
            deletedAt: entry.deletedAt ? entry.deletedAt.toISOString() : null,
          },
          today,
        ),
      )
      .map((entry) => entry.id);
    if (eligibleIds.length === 0) return;

    await this.prisma.volunteerHoursEntry.updateMany({
      where: { id: { in: eligibleIds } },
      data: {
        status: VolunteerHoursStatus.APPROVED,
        autoApproved: true,
        approvedAt: new Date(),
      },
    });
  }
}

function sumMinutes(rows: EntryRow[], status: VolunteerHoursStatus): number {
  return rows.filter((row) => row.status === status).reduce((total, row) => total + row.minutes, 0);
}

function toActor(actor: { id: string; firstName: string; lastName: string } | null): VolunteerHoursActor | null {
  return actor ? { id: actor.id, firstName: actor.firstName, lastName: actor.lastName } : null;
}

/** Inclusive `[from, to]` on `date`, or `undefined` when neither bound is given. */
function buildDateRangeFilter(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined;
  return {
    ...(from ? { gte: parseIsoDate(from) } : {}),
    ...(to ? { lte: parseIsoDate(to) } : {}),
  };
}

function buildReviewOrderBy(
  sort: 'date' | 'person' | 'minutes',
  order: 'asc' | 'desc',
): Prisma.VolunteerHoursEntryOrderByWithRelationInput | Prisma.VolunteerHoursEntryOrderByWithRelationInput[] {
  switch (sort) {
    case 'person':
      return [{ user: { firstName: order } }, { user: { lastName: order } }];
    case 'minutes':
      return { proposedMinutes: order };
    case 'date':
    default:
      return { date: order };
  }
}

/** Every failure `approveOne` throws is a Nest `HttpException`, which carries a `.message`. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Could not approve this entry.';
}

export function serializeEntry(row: EntryRow): VolunteerHoursEntryShape {
  return {
    id: row.id,
    userId: row.userId,
    user: toActor(row.user),
    source: row.source as VolunteerHoursSource,
    activityType: row.activityType as VolunteerActivityType,
    assignmentId: row.assignmentId,
    scheduleId: row.scheduleId,
    date: toIsoDate(row.date),
    description: row.description,
    baselineMinutes: row.baselineMinutes,
    proposedMinutes: row.proposedMinutes,
    minutes: row.minutes,
    flags: row.flags as VolunteerHoursFlag[],
    flagDetails: row.flagDetails as unknown as VolunteerHoursFlagDetail[] | null,
    status: row.status as VolunteerHoursStatus,
    approvedById: row.approvedById,
    approvedBy: toActor(row.approvedBy),
    approvedAt: row.approvedAt ? row.approvedAt.toISOString() : null,
    autoApproved: row.autoApproved,
    correctionReason: row.correctionReason,
    loggedById: row.loggedById,
    loggedBy: toActor(row.loggedBy),
    reopenedAt: row.reopenedAt ? row.reopenedAt.toISOString() : null,
    reopenedById: row.reopenedById,
    reopenedBy: toActor(row.reopenedBy),
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    deletedById: row.deletedById,
    deletedBy: toActor(row.deletedBy),
    deletionReason: row.deletionReason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
