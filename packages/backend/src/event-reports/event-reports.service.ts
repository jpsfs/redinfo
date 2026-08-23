import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  Action,
  CHAMU_FIELDS,
  EVENT_REPORT_TYPES,
  EventReport,
  EventReportCounts,
  EventReportDeleteResponse,
  EventReportInput,
  EventReportListFilters,
  EventReportSubmitResponse,
  EventReportType,
  UserRole,
  VITAL_KEYS,
  eventReportRules,
  hasPermission,
  parseEventReportCode,
  validateEventReport,
} from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ShiftScheduleService } from '../availability/shift-schedule.service';
import { isIsoDate, parseIsoDate, toIsoDate } from '../utils/date.util';
import { sanitizeReportHtml } from './sanitize-report';
import { EventReportNumbering } from './event-report-numbering';
import {
  EVENT_REPORT_INCLUDE,
  EventReportRow,
  reportRowToInput,
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

/**
 * Text with no markup in it, or null.
 *
 * Not `sanitizeReportHtml`: these fields are never rendered as HTML, so the
 * right treatment is to keep the characters and drop the tags rather than to
 * allow a safe subset.
 */
const plainText = (value: string | null | undefined): string | null =>
  value?.replace(/<[^>]*>/g, '').trim() || null;

/** What `create` does beyond writing the row. */
export interface CreateEventReportOptions {
  /**
   * File it immediately, which is what the wizard's "Gravar relatório" means:
   * someone who has walked seven steps of a form has filed a report, not left a
   * draft. Defaults to true, so the post-hoc path is unchanged by live mode.
   *
   * The live-run close passes `false` — a closed run becomes a *draft* report
   * that the crew finishes and files later, which is the whole point of the
   * "Pendentes" list.
   */
  submit?: boolean;
  /**
   * The caller, for the displacement guard.
   *
   * Only present when a person is on the other end of the request. The guard
   * exists to stop an operational's thumb rewriting numbers on already-filed
   * reports, so an internal call — which has no thumb — does not need it.
   */
  actor?: RequestUser;
}

@Injectable()
export class EventReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shiftSchedule: ShiftScheduleService,
    private readonly numbering: EventReportNumbering,
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
   * Writes a report, and — unless told otherwise — files it in the same
   * transaction.
   *
   * A report is created *without* a number. The number is a position in the
   * year's activation-ordered sequence, and a report that has not been filed has
   * no position: see `EventReportNumbering`. Filing is what assigns it, which is
   * why the two happen together here and why the whole thing is one transaction
   * — a report that exists with no number and no draft status would be a row
   * nothing can interpret.
   */
  async create(
    input: EventReportInput,
    createdById: string,
    options: CreateEventReportOptions = {},
  ): Promise<EventReport> {
    const { submit = true, actor } = options;
    const clean = await this.prepare(input);
    const year = Number(clean.occurredOn.slice(0, 4));
    const type = clean.type;

    const created = await this.prisma.$transaction(async (tx) => {
      // Before the insert, so a concurrent filing cannot slip between the
      // insert and the resequence and compute the same position.
      if (submit) await this.numbering.lockPartition(tx, type, year);

      const now = new Date();
      const row = await tx.eventReport.create({
        data: {
          ...this.toColumns(clean),
          type: type as never,
          number: null,
          year,
          createdById,
          ...(submit ? { submittedAt: now, submittedById: createdById } : {}),
          crew: { create: this.toCrewRows(clean) },
          vehicles: { create: this.toVehicleRows(clean) },
          victims: { create: this.toVictimRows(clean) },
          assessments: { create: this.toAssessmentRows(clean) },
        },
        select: { id: true },
      });

      if (submit) {
        await this.assertMayDisplace(tx, type, year, actor);
        await this.numbering.resequence(tx, type, year);
      }

      return tx.eventReport.findUniqueOrThrow({
        where: { id: row.id },
        include: EVENT_REPORT_INCLUDE,
      });
    });

    return serializeEventReport(created, await this.resolveShiftLabel(created));
  }

  /**
   * Files a draft, and says which already-filed reports it displaced.
   *
   * There is deliberately **no `unsubmit`**. Un-filing a report would re-punch
   * the hole in the numbering that this whole feature exists to close, and there
   * is no honest thing to do with the number in the meantime.
   */
  async submit(id: string, user: RequestUser): Promise<EventReportSubmitResponse> {
    const existing = await this.loadRow(id);
    this.assertCanWrite(existing, user);

    if (existing.submittedAt) {
      throw new BadRequestException('This report has already been filed.');
    }

    // What is *stored* has to be coherent, not just what was posted: a draft
    // closed out of a live run in a dead spot may be missing things the crew
    // still has to fill in.
    const problem = validateEventReport(reportRowToInput(existing));
    if (problem) throw new BadRequestException(problem.message);

    const type = existing.type as EventReportType;
    const year = existing.year;

    const result = await this.prisma.$transaction(async (tx) => {
      await this.numbering.lockPartition(tx, type, year);

      const now = new Date();
      await tx.eventReport.update({
        where: { id },
        data: { submittedAt: now, submittedById: user.id },
      });

      // Identity dies with the filing, in the filing's own transaction.
      //
      // Inline rather than through `IdentityPurgeService` so `event-reports` does
      // not depend on `live-runs` — the dependency runs the other way, because
      // closing a run creates a report. What is needed here is one UPDATE and no
      // key: destroying a blob does not require being able to open it.
      await tx.liveRun.updateMany({
        where: { reportId: id, identity: { not: null } },
        data: { identity: null, identityPurgedAt: now },
      });

      await this.assertMayDisplace(tx, type, year, user);
      const renumbered = await this.numbering.resequence(tx, type, year);

      const row = await tx.eventReport.findUniqueOrThrow({
        where: { id },
        include: EVENT_REPORT_INCLUDE,
      });
      return { row, renumbered };
    });

    return {
      report: serializeEventReport(result.row, await this.resolveShiftLabel(result.row)),
      renumbered: result.renumbered,
    };
  }

  /**
   * Refuses a filing that would rewrite numbers on reports already on paper,
   * unless the caller is a coordinator.
   *
   * Holding `MANAGE_EVENT_REPORTS` *is* the override — there is no separate
   * force flag, because the person who can be told "this will renumber four
   * filed reports" and decide is exactly the person who holds it.
   */
  private async assertMayDisplace(
    tx: Prisma.TransactionClient,
    type: EventReportType,
    year: number,
    actor?: RequestUser,
  ): Promise<void> {
    if (!actor || hasPermission(actor.role, Action.MANAGE_EVENT_REPORTS)) return;

    const displaced = await this.numbering.countDisplaced(tx, type, year);
    if (displaced === 0) return;

    throw new ConflictException(
      `Filing this report would change the number of ${displaced} report(s) already filed. ` +
        'A coordinator has to do it.',
    );
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
      await tx.eventReportAssessment.deleteMany({ where: { reportId: id } });

      return tx.eventReport.update({
        where: { id },
        data: {
          ...this.toColumns(clean),
          crew: { create: this.toCrewRows(clean) },
          vehicles: { create: this.toVehicleRows(clean) },
          victims: { create: this.toVictimRows(clean) },
          assessments: { create: this.toAssessmentRows(clean) },
        },
        include: EVENT_REPORT_INCLUDE,
      });
    });

    return serializeEventReport(updated, await this.resolveShiftLabel(updated));
  }

  /**
   * Removes a report, and closes the gap it leaves.
   *
   * Reserved for `MANAGE_EVENT_REPORTS`. Deleting one is for a report that
   * should never have existed; correcting a report is an edit.
   *
   * The gap is closed rather than left, because numbering is gap-free by
   * construction now — which means deleting report 42 renumbers 43 onwards, and
   * that is a visible consequence rather than a hidden one: the caller is handed
   * the list of what moved, and every move is in the log.
   */
  async remove(id: string, user: RequestUser): Promise<EventReportDeleteResponse> {
    if (!hasPermission(user.role, Action.MANAGE_EVENT_REPORTS)) {
      throw new ForbiddenException('Only a coordinator can delete a filed report.');
    }
    const existing = await this.loadRow(id);
    const type = existing.type as EventReportType;
    const year = existing.year;

    const renumbered = await this.prisma.$transaction(async (tx) => {
      await this.numbering.lockPartition(tx, type, year);
      await tx.eventReport.delete({ where: { id } });
      return this.numbering.resequence(tx, type, year);
    });

    return { id, renumbered };
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
      // CHAMU is plain text, so it is *stripped* rather than sanitized as
      // markup: a crew dictating "tensão < 90" must not have half the note
      // swallowed as an unclosed tag, and nothing renders these as HTML.
      ...Object.fromEntries(
        CHAMU_FIELDS.map((field) => [field, plainText(input[field])]),
      ),
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
    const text = (value: string | null | undefined) => value?.trim() || null;

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

      // Same belt-and-braces as the timestamps above: a type with no clinical
      // record stores nulls whatever the payload said. `validateEventReport`
      // already refuses stray clinical data, so this only ever matters to a
      // future caller that skips validation.
      chamuCircumstances: rules.hasClinicalRecord ? text(input.chamuCircumstances) : null,
      chamuHistory: rules.hasClinicalRecord ? text(input.chamuHistory) : null,
      chamuAllergies: rules.hasClinicalRecord ? text(input.chamuAllergies) : null,
      chamuMedication: rules.hasClinicalRecord ? text(input.chamuMedication) : null,
      chamuLastMeal: rules.hasClinicalRecord ? text(input.chamuLastMeal) : null,
      abcde:
        rules.hasClinicalRecord && input.abcde && Object.keys(input.abcde).length > 0
          ? (input.abcde as Prisma.InputJsonValue)
          : Prisma.DbNull,
    };
  }

  /**
   * The sets of observations, ordered as they were taken.
   *
   * `temperature` is passed as a string, not a number: it lands in a
   * `Decimal(3,1)` column, and handing Prisma a float is how 36.8 becomes
   * 36.799999999999997 in exactly one environment.
   */
  private toAssessmentRows(input: EventReportInput) {
    const rules = eventReportRules(input.type);
    if (!rules.hasClinicalRecord) return [];

    return (input.assessments ?? []).map((assessment, position) => {
      const vitals: Record<string, number | string | null> = {};
      for (const key of VITAL_KEYS) {
        const value = assessment[key];
        if (value === null || value === undefined) {
          vitals[key] = null;
        } else {
          vitals[key] = key === 'temperature' ? value.toFixed(1) : value;
        }
      }
      return {
        position,
        takenAt: new Date(assessment.takenAt),
        bodyPosition: assessment.bodyPosition?.trim() || null,
        ...vitals,
      } as Prisma.EventReportAssessmentCreateWithoutReportInput;
    });
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

    // `submittedAt IS NULL` *is* the draft state — there is no status enum to
    // read instead, and that is the point.
    if (filters.filed === 'DRAFT') clauses.push({ submittedAt: null });
    if (filters.filed === 'SUBMITTED') clauses.push({ submittedAt: { not: null } });

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
        const scope = {
          ...(code.type ? { type: code.type as never } : {}),
          ...(code.year !== undefined ? { year: code.year } : {}),
        };
        clauses.push(
          code.number === undefined
            ? scope
            : {
                ...scope,
                // `legacyNumber` as well as `number`, because renumbering
                // rewrites the identity of reports that are already on paper.
                // Someone holding "EMG 042/2026" has to be able to find what it
                // became.
                OR: [{ number: code.number }, { legacyNumber: code.number }],
              },
        );
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
