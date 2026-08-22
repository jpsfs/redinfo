import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  Action,
  EVENT_REPORT_TYPES,
  EventReport,
  EventReportCounts,
  EventReportInput,
  EventReportListFilters,
  EventReportType,
  UserRole,
  eventReportRules,
  hasPermission,
  parseEventReportCode,
  validateEventReport,
} from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ShiftScheduleService } from '../availability/shift-schedule.service';
import { isIsoDate, parseIsoDate, toIsoDate } from '../utils/date.util';
import { sanitizeReportHtml } from './sanitize-report';
import {
  EVENT_REPORT_INCLUDE,
  EventReportRow,
  serializeEventReport,
} from './event-report.serializer';

/** Just enough of the caller to answer "may they read or change this report". */
export interface RequestUser {
  id: string;
  role: UserRole;
}

/**
 * Reports this person was part of — on the crew, or the one who filed it.
 *
 * Both halves matter: a coordinator who types up a crew's report is not on the
 * crew, and a crew member whose colleague filed it is not the author.
 */
const involves = (userId: string): Prisma.EventReportWhereInput => ({
  OR: [{ createdById: userId }, { crew: { some: { userId } } }],
});

@Injectable()
export class EventReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shiftSchedule: ShiftScheduleService,
  ) {}

  // ── Reading ────────────────────────────────────────────────────────────────

  async findAll(filters: EventReportListFilters = {}, page = 1, perPage = 25) {
    const where = this.buildWhere(filters);
    const skip = (page - 1) * perPage;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.eventReport.findMany({
        where,
        skip,
        take: perPage,
        orderBy: [{ occurredOn: 'desc' }, { startedAt: 'desc' }],
        include: EVENT_REPORT_INCLUDE,
      }),
      this.prisma.eventReport.count({ where }),
    ]);

    return { data: rows.map((row) => serializeEventReport(row)), total, page, perPage };
  }

  /**
   * The reports one person was part of.
   *
   * Scoped in the service rather than gated by an action, the same way
   * `GET /schedules/me` is: someone who cannot read the whole archive can
   * always read the activities they were on.
   */
  async findMine(userId: string, filters: EventReportListFilters = {}, page = 1, perPage = 25) {
    const where: Prisma.EventReportWhereInput = {
      AND: [this.buildWhere(filters), involves(userId)],
    };
    const skip = (page - 1) * perPage;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.eventReport.findMany({
        where,
        skip,
        take: perPage,
        orderBy: [{ occurredOn: 'desc' }, { startedAt: 'desc' }],
        include: EVENT_REPORT_INCLUDE,
      }),
      this.prisma.eventReport.count({ where }),
    ]);

    return { data: rows.map((row) => serializeEventReport(row)), total, page, perPage };
  }

  /**
   * Per-type counts for the list's filter tabs.
   *
   * Every type is always present, so a tab reading zero says "none of these
   * yet" instead of disappearing and leaving the reader to wonder. Scoped to
   * the caller when they cannot read everything, so the tabs never advertise
   * reports they would be refused.
   */
  async counts(
    filters: EventReportListFilters = {},
    user?: RequestUser,
  ): Promise<EventReportCounts> {
    // The type filter is deliberately dropped: the tabs count what each *would*
    // show, so clicking one must not change the others' numbers.
    const { type: _ignored, ...rest } = filters;
    const scope: Prisma.EventReportWhereInput[] = [this.buildWhere(rest)];
    if (user && !hasPermission(user.role, Action.VIEW_EVENT_REPORTS)) {
      scope.push(involves(user.id));
    }
    const where: Prisma.EventReportWhereInput = { AND: scope };

    const grouped = await this.prisma.eventReport.groupBy({
      by: ['type'],
      where,
      _count: { _all: true },
    });

    const counts = EVENT_REPORT_TYPES.reduce(
      (all, reportType) => ({ ...all, [reportType]: 0 }),
      {} as EventReportCounts,
    );
    counts.ALL = 0;
    for (const group of grouped) {
      counts[group.type as EventReportType] = group._count._all;
      counts.ALL += group._count._all;
    }
    return counts;
  }

  async findOne(id: string, user: RequestUser): Promise<EventReport> {
    const row = await this.loadRow(id);
    this.assertCanRead(row, user);
    return serializeEventReport(row, await this.resolveShiftLabel(row));
  }

  // ── Writing ────────────────────────────────────────────────────────────────

  /**
   * Files a report and assigns its number in one transaction.
   *
   * The counter upsert compiles to a single `INSERT ... ON CONFLICT DO UPDATE`,
   * which row-locks for the statement's duration: two crews filing an
   * emergency report at the same second serialise on the `(EMERGENCY, 2026)`
   * row and cannot be handed the same number. Wrapping it with the insert means
   * a later failure rolls the increment back rather than burning a number.
   */
  async create(input: EventReportInput, createdById: string): Promise<EventReport> {
    const clean = await this.prepare(input);
    const year = Number(clean.occurredOn.slice(0, 4));

    const created = await this.prisma.$transaction(async (tx) => {
      const counter = await tx.eventReportCounter.upsert({
        where: { type_year: { type: clean.type as never, year } },
        create: { type: clean.type as never, year, sequence: 1 },
        update: { sequence: { increment: 1 } },
      });

      return tx.eventReport.create({
        data: {
          ...this.toColumns(clean),
          type: clean.type as never,
          number: counter.sequence,
          year,
          createdById,
          crew: { create: this.toCrewRows(clean) },
          vehicles: { create: this.toVehicleRows(clean) },
          victims: { create: this.toVictimRows(clean) },
        },
        include: EVENT_REPORT_INCLUDE,
      });
    });

    return serializeEventReport(created, await this.resolveShiftLabel(created));
  }

  /**
   * Replaces a report's contents. Identity — type, number, year — never moves:
   * a filed report keeps the number it was given, and a report that turns out
   * to be the wrong kind of activity is a new report, not an edited one.
   *
   * Crew, vehicles and victims are replaced wholesale rather than diffed. They
   * are ordered lists the form owns end to end, and "delete then insert inside
   * one transaction" is both simpler to reason about and immune to the
   * half-applied states a diff can leave behind.
   */
  async update(id: string, input: EventReportInput, user: RequestUser): Promise<EventReport> {
    const existing = await this.loadRow(id);
    this.assertCanWrite(existing, user);

    const clean = await this.prepare({ ...input, type: existing.type as EventReportType });

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.eventReportCrewMember.deleteMany({ where: { reportId: id } });
      await tx.eventReportVehicle.deleteMany({ where: { reportId: id } });
      await tx.eventReportVictim.deleteMany({ where: { reportId: id } });

      return tx.eventReport.update({
        where: { id },
        data: {
          ...this.toColumns(clean),
          crew: { create: this.toCrewRows(clean) },
          vehicles: { create: this.toVehicleRows(clean) },
          victims: { create: this.toVictimRows(clean) },
        },
        include: EVENT_REPORT_INCLUDE,
      });
    });

    return serializeEventReport(updated, await this.resolveShiftLabel(updated));
  }

  /**
   * Removes a report outright.
   *
   * Reserved for `MANAGE_EVENT_REPORTS` because it punches a hole in the year's
   * numbering — the sequence is never reused, so a deleted report leaves a gap
   * that an auditor will ask about. Correcting a report is an edit; deleting
   * one is for a report that should never have existed.
   */
  async remove(id: string, user: RequestUser): Promise<{ id: string }> {
    if (!hasPermission(user.role, Action.MANAGE_EVENT_REPORTS)) {
      throw new ForbiddenException('Only a coordinator can delete a filed report.');
    }
    await this.loadRow(id);
    await this.prisma.eventReport.delete({ where: { id } });
    return { id };
  }

  // ── Access ─────────────────────────────────────────────────────────────────

  /**
   * Reading the whole archive is a coordinator's job; reading an activity you
   * were on is nobody's privilege to withhold — without this an operational is
   * bounced off the report they just filed.
   */
  assertCanRead(row: EventReportRow, user: RequestUser): void {
    if (hasPermission(user.role, Action.VIEW_EVENT_REPORTS)) return;
    if (this.isInvolved(row, user.id)) return;
    throw new ForbiddenException(
      'Only the crew of this activity and coordinators can read this report.',
    );
  }

  /**
   * Anyone on the crew may finish the report — the end time and the narrative
   * are routinely added the next morning by whoever gets to a keyboard first.
   * Editing someone else's needs `MANAGE_EVENT_REPORTS`.
   */
  assertCanWrite(row: EventReportRow, user: RequestUser): void {
    if (hasPermission(user.role, Action.MANAGE_EVENT_REPORTS)) return;
    if (
      hasPermission(user.role, Action.CREATE_EVENT_REPORT) &&
      this.isInvolved(row, user.id)
    ) {
      return;
    }
    throw new ForbiddenException(
      'Only the crew of this activity and coordinators can change this report.',
    );
  }

  private isInvolved(row: EventReportRow, userId: string): boolean {
    if (row.createdById === userId) return true;
    return row.crew.some((member) => member.userId === userId);
  }

  async loadRow(id: string): Promise<EventReportRow> {
    const row = await this.prisma.eventReport.findUnique({
      where: { id },
      include: EVENT_REPORT_INCLUDE,
    });
    if (!row) throw new NotFoundException(`Event report ${id} not found`);
    return row;
  }

  // ── Input handling ─────────────────────────────────────────────────────────

  /**
   * Sanitizes, validates, and checks that everything the payload points at
   * exists — in that order.
   *
   * Sanitizing before validating matters: `<script>note</script>` would
   * otherwise satisfy "the report cannot be empty" and then be stored as
   * nothing at all.
   */
  private async prepare(input: EventReportInput): Promise<EventReportInput> {
    const clean: EventReportInput = {
      ...input,
      occurredOn: this.assertIsoDate(input.occurredOn),
      externalReference: input.externalReference?.trim() || null,
      operationalReport: sanitizeReportHtml(input.operationalReport ?? ''),
    };

    // The message, not the whole problem: the code is for the wizard to
    // translate, and an API 400 should read as a sentence.
    const problem = validateEventReport(clean);
    if (problem) throw new BadRequestException(problem.message);

    await this.assertReferencesExist(clean);
    return clean;
  }

  /**
   * Foreign keys, checked up front with a message that names what is wrong.
   *
   * Prisma would raise these as P2003 on insert, but "Foreign key constraint
   * failed on the field: `localityId`" is not something to show a crew at
   * midnight.
   */
  private async assertReferencesExist(input: EventReportInput): Promise<void> {
    const [locality, vehicles, users, hospitals] = await Promise.all([
      this.prisma.locality.count({ where: { id: input.localityId } }),
      input.vehicles.length
        ? this.prisma.vehicle.findMany({
            where: { id: { in: input.vehicles.map((vehicle) => vehicle.vehicleId) } },
            select: { id: true },
          })
        : Promise.resolve([]),
      input.crew.length
        ? this.prisma.user.findMany({
            where: { id: { in: input.crew.map((member) => member.userId) } },
            select: { id: true },
          })
        : Promise.resolve([]),
      this.hospitalIdsIn(input),
    ]);

    if (locality === 0) {
      throw new BadRequestException(`Locality ${input.localityId} not found`);
    }
    if (vehicles.length !== input.vehicles.length) {
      throw new BadRequestException('One of the vehicles on this report no longer exists.');
    }
    if (users.length !== input.crew.length) {
      throw new BadRequestException('One of the people on this crew no longer exists.');
    }

    const wantedHospitals = new Set(
      input.victims
        .map((victim) => victim.destinationHospitalId)
        .filter((id): id is string => Boolean(id)),
    );
    if (hospitals.length !== wantedHospitals.size) {
      throw new BadRequestException('One of the hospitals on this report no longer exists.');
    }

    if (input.shift) {
      const schedule = await this.prisma.schedule.count({
        where: { id: input.shift.scheduleId },
      });
      if (schedule === 0) {
        throw new BadRequestException(`Schedule ${input.shift.scheduleId} not found`);
      }
    }
  }

  private hospitalIdsIn(input: EventReportInput) {
    const ids = [
      ...new Set(
        input.victims
          .map((victim) => victim.destinationHospitalId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    if (ids.length === 0) return Promise.resolve([] as Array<{ id: string }>);
    return this.prisma.hospital.findMany({ where: { id: { in: ids } }, select: { id: true } });
  }

  /** Scalar columns, shared by create and update so neither can drift. */
  private toColumns(input: EventReportInput) {
    const rules = eventReportRules(input.type);
    const at = (value: string | null | undefined) => (value ? new Date(value) : null);

    return {
      occurredOn: parseIsoDate(input.occurredOn),
      startedAt: new Date(input.startedAt),
      endedAt: at(input.endedAt),
      externalReference: input.externalReference ?? null,
      locationType: input.locationType as never,
      localityId: input.localityId,

      // A type without a chronology stores nulls, whatever the payload said.
      // `validateEventReport` already refuses a stray timestamp, so this is
      // belt-and-braces against a future caller that skips validation.
      activationAt: rules.hasOccurrenceTimes ? at(input.activationAt) : null,
      sceneArrivalAt: rules.hasOccurrenceTimes ? at(input.sceneArrivalAt) : null,
      sceneDepartureAt: rules.hasOccurrenceTimes ? at(input.sceneDepartureAt) : null,
      hospitalArrivalAt: rules.hasOccurrenceTimes ? at(input.hospitalArrivalAt) : null,
      availableAt: rules.hasOccurrenceTimes ? at(input.availableAt) : null,

      scheduleId: input.shift?.scheduleId ?? null,
      shiftDate: input.shift ? parseIsoDate(input.shift.date) : null,
      shiftSlot: input.shift?.slot ?? null,

      operationalReport: input.operationalReport,
    };
  }

  private toCrewRows(input: EventReportInput) {
    return input.crew.map((member, position) => ({
      userId: member.userId,
      roleName: member.roleName?.trim() || null,
      position,
    }));
  }

  private toVehicleRows(input: EventReportInput) {
    return input.vehicles.map((vehicle, position) => ({
      vehicleId: vehicle.vehicleId,
      kilometres: vehicle.kilometres,
      position,
    }));
  }

  private toVictimRows(input: EventReportInput) {
    return input.victims.map((victim, position) => ({
      position,
      gender: victim.gender as never,
      age: victim.age,
      destinationKind: victim.destinationKind as never,
      destinationHospitalId: victim.destinationHospitalId ?? null,
    }));
  }

  // ── Filtering ──────────────────────────────────────────────────────────────

  /**
   * The list's `where`, from the filters a coordinator actually uses.
   *
   * `q` is tried as a report code first ("EMG 128/2026", "128/2026", "emg128"),
   * because that is what someone holding a piece of paper types. Only when it
   * is not a code does it become a text search across the locality, the
   * external reference and the crew's names.
   */
  private buildWhere(filters: EventReportListFilters): Prisma.EventReportWhereInput {
    const clauses: Prisma.EventReportWhereInput[] = [];

    if (filters.type) clauses.push({ type: filters.type as never });

    if (filters.from || filters.to) {
      clauses.push({
        occurredOn: {
          ...(filters.from ? { gte: parseIsoDate(this.assertIsoDate(filters.from)) } : {}),
          ...(filters.to ? { lte: parseIsoDate(this.assertIsoDate(filters.to)) } : {}),
        },
      });
    }

    const q = filters.q?.trim();
    if (q) {
      const code = parseEventReportCode(q);
      if (code && (code.number !== undefined || code.type !== undefined)) {
        clauses.push({
          ...(code.type ? { type: code.type as never } : {}),
          ...(code.number !== undefined ? { number: code.number } : {}),
          ...(code.year !== undefined ? { year: code.year } : {}),
        });
      } else {
        clauses.push({
          OR: [
            { externalReference: { contains: q, mode: 'insensitive' } },
            { locality: { name: { contains: q, mode: 'insensitive' } } },
            {
              crew: {
                some: {
                  user: {
                    OR: [
                      { firstName: { contains: q, mode: 'insensitive' } },
                      { lastName: { contains: q, mode: 'insensitive' } },
                    ],
                  },
                },
              },
            },
          ],
        });
      }
    }

    return clauses.length ? { AND: clauses } : {};
  }

  private assertIsoDate(value: string): string {
    const normalised = value?.length > 10 ? toIsoDate(value) : value;
    if (!isIsoDate(normalised)) {
      throw new BadRequestException(
        `Expected a calendar date (YYYY-MM-DD), got "${value}"`,
      );
    }
    return normalised;
  }

  /**
   * The clock span of the shift a report's crew came from, e.g. "20:00–24:00".
   *
   * Loaded only for a single report: it needs the window's per-day pattern, and
   * a list of forty reports is not worth forty pattern loads for a label.
   */
  private async resolveShiftLabel(row: EventReportRow): Promise<string | undefined> {
    if (!row.shiftDate || row.shiftSlot === null || !row.schedule?.window) return undefined;

    const pattern = await this.shiftSchedule.getPatternForWindow({
      id: row.schedule.windowId,
      startDate: toIsoDate(row.schedule.window.startDate),
      endDate: toIsoDate(row.schedule.window.endDate),
    });

    const date = toIsoDate(row.shiftDate);
    const day = pattern.find((entry) => entry.date === date);
    return day?.shifts.find((shift) => shift.slot === row.shiftSlot)?.label;
  }
}
