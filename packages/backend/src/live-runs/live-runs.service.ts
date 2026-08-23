import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  Action,
  EventReport,
  LIVE_RUN_IDENTITY_FIELDS,
  LIVE_RUN_RETENTION_HOURS,
  LiveRun,
  LiveRunBoardEntry,
  LiveRunCloseResponse,
  LiveRunIdentity,
  LiveRunState,
  LiveRunSyncResponse,
  hasPermission,
  isLiveRunReadable,
  liveRunCloseBlockers,
  liveRunClosingStamps,
  liveRunToEventReportInput,
  validateLiveRun,
} from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { parseIsoDate } from '../utils/date.util';
import { EventReportsService, RequestUser } from '../event-reports/event-reports.service';
import { IdentityCipher, UnknownIdentityKeyError } from './identity-cipher';
import { IdentityPurgeService } from './identity-purge.service';
import { DelegationSettingsService } from './delegation-settings.service';
import { RouteDistanceService, RouteWaypoint } from './route-distance.service';
import {
  LIVE_RUN_BOARD_SELECT,
  LIVE_RUN_INCLUDE,
  LiveRunRow,
  OpenedIdentity,
  serializeLiveRun,
  serializeLiveRunBoardEntry,
} from './live-run.serializer';

/** The whole document a phone syncs, already through the DTO's shape checks. */
export type LiveRunSyncInput = Parameters<typeof validateLiveRun>[0];

/**
 * The columns a sync writes — which is every column except the ones a sync must
 * never touch.
 *
 * Spelling the exclusions out is the point. `id` and `createdById` are set once,
 * at creation; `reportId` and `closedAt` belong to closing, which is a different
 * route for a reason; `identityPurgedAt` belongs to the purge, which is final.
 * A phone that has been in a cellar for an hour cannot reach any of them.
 */
type LiveRunColumns = Omit<
  Prisma.LiveRunUncheckedCreateInput,
  'id' | 'createdById' | 'createdAt' | 'updatedAt' | 'crew' | 'reportId' | 'closedAt' | 'identityPurgedAt'
>;

@Injectable()
export class LiveRunsService {
  private readonly logger = new Logger(LiveRunsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: IdentityCipher,
    private readonly purge: IdentityPurgeService,
    private readonly reports: EventReportsService,
    private readonly settings: DelegationSettingsService,
    private readonly routes: RouteDistanceService,
  ) {}

  // ── Reading ────────────────────────────────────────────────────────────────

  /**
   * The coordinator's board: the runs that are open right now.
   *
   * Through `LIVE_RUN_BOARD_SELECT`, which never selects the ciphertext column
   * at all — a board request cannot leak identity by accident, because it never
   * loads any.
   */
  async board(): Promise<LiveRunBoardEntry[]> {
    const rows = await this.prisma.liveRun.findMany({
      where: { closedAt: null },
      orderBy: { startedAt: 'asc' },
      select: LIVE_RUN_BOARD_SELECT,
    });
    return rows.map(serializeLiveRunBoardEntry);
  }

  /**
   * The caller's own runs — open ones, and closed ones still inside retention.
   *
   * Scoped in the service rather than gated by an action, the same way
   * `GET /event-reports/me` is: a crew member can always see the run they are on.
   */
  async findMine(user: RequestUser): Promise<LiveRun[]> {
    const cutoff = new Date(Date.now() - LIVE_RUN_RETENTION_HOURS * 3600_000);
    const rows = await this.prisma.liveRun.findMany({
      where: {
        OR: [{ createdById: user.id }, { crew: { some: { userId: user.id } } }],
        AND: [{ OR: [{ closedAt: null }, { closedAt: { gte: cutoff } }] }],
      },
      orderBy: { startedAt: 'desc' },
      include: LIVE_RUN_INCLUDE,
    });
    return rows.map((row) => serializeLiveRun(row, this.openIdentity(row)));
  }

  async findOne(id: string, user: RequestUser): Promise<LiveRun> {
    const row = await this.loadRow(id);
    this.assertCanReadRun(row, user);
    return serializeLiveRun(row, this.openIdentity(row));
  }

  /**
   * The row, and never a row that should no longer exist.
   *
   * The inline purge is here rather than only in the sweep because correctness
   * must not depend on a timer: a run read 49 hours after it closed has its
   * identity destroyed *before* the row is handed back, and then the read is
   * refused anyway. A dead scheduler cannot leak identity through this path.
   */
  async loadRow(id: string, now: Date = new Date()): Promise<LiveRunRow> {
    const row = await this.prisma.liveRun.findUnique({
      where: { id },
      include: LIVE_RUN_INCLUDE,
    });
    if (!row) throw new NotFoundException(`Live run ${id} not found`);

    if (await this.purge.purgeIfDue(row, now)) {
      return this.prisma.liveRun.findUniqueOrThrow({
        where: { id },
        include: LIVE_RUN_INCLUDE,
      });
    }
    return row;
  }

  // ── Access ─────────────────────────────────────────────────────────────────

  /**
   * The time gate goes **first, for everyone** — no branch can skip it.
   *
   * `NotFoundException` rather than `Forbidden` for an expired run: the sweep is
   * about to delete the row, and an endpoint that answers 403 or 404 depending on
   * when a cleaner last ran is worse than one that always says the run is gone.
   */
  assertCanReadRun(
    row: Pick<LiveRunRow, 'closedAt' | 'createdById' | 'crew'>,
    user: RequestUser,
    now: Date = new Date(),
  ): void {
    if (!isLiveRunReadable({ closedAt: row.closedAt?.toISOString() ?? null }, now)) {
      throw new NotFoundException('This run is past its retention window.');
    }
    if (hasPermission(user.role, Action.VIEW_LIVE_RUNS)) return;
    if (this.isOnRun(row, user.id)) return;
    throw new ForbiddenException(
      'Only the crew of this run and emergency coordinators can read it.',
    );
  }

  /**
   * Writing is the crew's alone.
   *
   * **A coordinator may not write someone else's run**, deliberately. Reading the
   * board is oversight; editing a phone's local truth from a desk is not, and it
   * would break the revision contract the whole sync rests on — the device's
   * counter is the only ordering the server trusts, and a desk has no counter.
   */
  assertCanWriteRun(
    row: Pick<LiveRunRow, 'createdById' | 'crew' | 'reportId'>,
    user: RequestUser,
  ): void {
    if (row.reportId) {
      throw new BadRequestException(
        'This run has been closed into a report. Change the report instead.',
      );
    }
    if (!hasPermission(user.role, Action.CREATE_EVENT_REPORT)) {
      throw new ForbiddenException('Only field crew can record a live run.');
    }
    if (this.isOnRun(row, user.id)) return;
    throw new ForbiddenException('Only the crew of this run can change it.');
  }

  private isOnRun(
    row: { createdById: string; crew: Array<{ userId: string }> },
    userId: string,
  ): boolean {
    if (row.createdById === userId) return true;
    return row.crew.some((member) => member.userId === userId);
  }

  // ── Syncing ────────────────────────────────────────────────────────────────

  /**
   * The whole document, replacing whatever was there.
   *
   * Idempotent by construction: the same PUT twice leaves one row in the same
   * state, which is what lets the phone's outbox retry blindly. A PUT at or below
   * the stored revision is a stale replay from a phone that has been in a cellar,
   * and is answered **200 with the stored row** rather than 409 — that is normal
   * operation on a bad network, not an error to put in front of a crew mid-call.
   */
  async sync(input: LiveRunSyncInput, user: RequestUser): Promise<LiveRunSyncResponse> {
    const problem = validateLiveRun(input);
    if (problem) throw new BadRequestException(problem.message);

    // Closing creates a report, which is a great deal more than a field change.
    // It has its own route so it cannot happen as a side effect of a sync.
    if (input.state === LiveRunState.CLOSED) {
      throw new BadRequestException('Close a run through POST /live-runs/:id/close.');
    }

    const existing = await this.prisma.liveRun.findUnique({
      where: { id: input.id },
      include: LIVE_RUN_INCLUDE,
    });

    if (!existing) {
      await this.assertReferencesExist(input);
      const created = await this.prisma.$transaction(async (tx) => {
        await tx.liveRun.create({
          data: {
            ...this.toColumns(input, null),
            id: input.id,
            createdById: user.id,
            crew: { create: this.toCrewRows(input) },
          },
          select: { id: true },
        });
        return tx.liveRun.findUniqueOrThrow({
          where: { id: input.id },
          include: LIVE_RUN_INCLUDE,
        });
      });
      return { run: serializeLiveRun(created, this.openIdentity(created)), stale: false };
    }

    this.assertCanWriteRun(existing, user);

    if (input.revision <= existing.revision) {
      return {
        run: serializeLiveRun(existing, this.openIdentity(existing)),
        stale: true,
      };
    }

    await this.assertReferencesExist(input);

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.liveRunCrewMember.deleteMany({ where: { runId: input.id } });
      return tx.liveRun.update({
        where: { id: input.id },
        data: {
          ...this.toColumns(input, existing),
          crew: { create: this.toCrewRows(input) },
        },
        include: LIVE_RUN_INCLUDE,
      });
    });

    return { run: serializeLiveRun(updated, this.openIdentity(updated)), stale: false };
  }

  // ── Closing ────────────────────────────────────────────────────────────────

  /**
   * Closes the run and hands back the draft report it became.
   *
   * The draft is the point. A crew that has just put an ambulance back in service
   * is dropped straight onto the edit page of a report that already knows the
   * times, the crew, the vehicle and the vitals — rather than onto an empty
   * seven-step wizard they will fill in from memory tomorrow, which is the
   * failure this whole feature exists to prevent.
   *
   * Not one transaction, on purpose. The run is closed first, then the report is
   * created, then the two are linked; a failure in the middle leaves a closed run
   * with no report, and calling close again finishes the job. The other order
   * would leave a draft report nobody knows about.
   */
  async close(id: string, user: RequestUser): Promise<LiveRunCloseResponse> {
    const existing = await this.loadRow(id);
    this.assertCanWriteRun(existing, user);

    const now = new Date();
    const asInput = this.rowToInput(existing);

    const blockers = liveRunCloseBlockers(asInput);
    if (blockers.length > 0) {
      throw new BadRequestException(
        `This run cannot be closed yet: ${blockers.join(', ')}.`,
      );
    }

    const stamps = liveRunClosingStamps(asInput, now);
    const closed = await this.prisma.liveRun.update({
      where: { id },
      data: {
        state: LiveRunState.CLOSED as never,
        closedAt: existing.closedAt ?? now,
        ...(stamps.sceneDepartureAt ? { sceneDepartureAt: new Date(stamps.sceneDepartureAt) } : {}),
        ...(stamps.availableAt ? { availableAt: new Date(stamps.availableAt) } : {}),
      },
      include: LIVE_RUN_INCLUDE,
    });

    const report = await this.reports.create(
      liveRunToEventReportInput(this.rowToInput(closed), { now }),
      user.id,
      // A draft, not a filing. The crew finishes it and files it, which is what
      // gives the number its place in the activation-ordered sequence.
      { submit: false },
    );

    const linked = await this.prisma.liveRun.update({
      where: { id },
      data: { reportId: report.id },
      include: LIVE_RUN_INCLUDE,
    });

    // Re-read rather than return the copy `create` handed back: that one was
    // serialized before the link existed, so its `liveRunId` is null — and
    // `liveRunId` is exactly what tells the report's own page it came out of a
    // run and can be opened as one.
    const linkedReport = await this.reports.findOne(report.id, user);
    const withDistance = await this.attachRouteDistance(linked, linkedReport);

    return {
      run: serializeLiveRun(linked, this.openIdentity(linked)),
      report: withDistance,
    };
  }

  /**
   * Fills in the computed kilometres, if there is a network and a key.
   *
   * Best effort by design: no network at close is the normal case in a valley,
   * and the run closes regardless. The report shows "por calcular" until someone
   * recomputes it, which is a warning and never a block.
   *
   * The occurrence address comes out of the identity blob — it is the only place
   * a street number exists — and goes no further than Google's routing call. The
   * report itself never carries it.
   */
  private async attachRouteDistance(
    row: LiveRunRow,
    report: EventReport,
  ): Promise<EventReport> {
    if (!this.routes.configured) return report;
    if (report.vehicles.length === 0) return report;

    try {
      const settings = await this.settings.get();
      const opened = this.openIdentity(row);
      const occurrence = this.occurrenceWaypoint(row, opened);
      if (!occurrence) return report;

      const legs = await this.routes.routeForRun(settings, {
        occurrence,
        hospital: row.destinationHospital
          ? { label: row.destinationHospital.name, address: row.destinationHospital.name }
          : null,
      });
      if (!legs || legs.length === 0) return report;

      const total = legs.reduce((sum, leg) => sum + leg.kilometres, 0);
      await this.prisma.eventReportVehicle.updateMany({
        where: { reportId: report.id },
        data: { kilometres: total, routeLegs: legs as never, isOverridden: false },
      });

      return {
        ...report,
        vehicles: report.vehicles.map((vehicle) => ({
          ...vehicle,
          kilometres: total,
          routeLegs: legs,
          isOverridden: false,
        })),
      };
    } catch (cause) {
      this.logger.warn(
        `Could not attach a computed distance to report ${report.id}: ${(cause as Error).message}`,
      );
      return report;
    }
  }

  /** Where the call was, as precisely as we can name it. */
  private occurrenceWaypoint(
    row: LiveRunRow,
    opened: OpenedIdentity,
  ): RouteWaypoint | null {
    const address = opened.identity?.occurrenceAddress?.trim();
    const locality = row.locality
      ? `${row.locality.name}, ${row.locality.municipality?.name ?? ''}`.trim()
      : null;

    // The street when we have it, the locality when we do not — a route to the
    // middle of the right village beats no route at all.
    const target = address || locality;
    if (!target) return null;
    return {
      label: row.locality?.name ?? 'Local da ocorrência',
      address: address && locality ? `${address}, ${locality}, Portugal` : `${target}, Portugal`,
    };
  }

  // ── Identity ───────────────────────────────────────────────────────────────

  /**
   * Opens the blob, or says why it could not.
   *
   * A key this process does not have yields `identityUnavailable: true` rather
   * than a 500 — a key retired an hour early must not take the coordinator's
   * board down. Anything else is tampering or corruption, and is logged and
   * treated the same way rather than thrown: the run's chronology is still worth
   * reading when its name field is not.
   */
  private openIdentity(row: Pick<LiveRunRow, 'id' | 'identity'>): OpenedIdentity {
    if (!row.identity) return {};
    try {
      return { identity: this.cipher.open(row.id, Buffer.from(row.identity)) };
    } catch (cause) {
      if (!(cause instanceof UnknownIdentityKeyError)) {
        this.logger.error(
          `Identity blob on run ${row.id} could not be opened: ${(cause as Error).message}`,
        );
      }
      return { identityUnavailable: true };
    }
  }

  /**
   * Seals identity for storage, or destroys it.
   *
   * `undefined` means "leave the column alone" and is different from a payload
   * of blanks, which means the crew cleared the fields. A run whose identity has
   * already been purged never gets it back: the purge is final, and a phone
   * syncing an hour late must not resurrect a name we promised to destroy.
   */
  private sealIdentity(
    identity: LiveRunIdentity | null | undefined,
    runId: string,
    existing: Pick<LiveRunRow, 'identityPurgedAt'> | null,
  ): Prisma.LiveRunUpdateInput['identity'] | undefined {
    if (existing?.identityPurgedAt) return undefined;
    if (identity === undefined) return undefined;

    const hasAnything =
      identity !== null &&
      LIVE_RUN_IDENTITY_FIELDS.some((field) => {
        const value = identity[field];
        return typeof value === 'string' && value.trim().length > 0;
      });
    if (!hasAnything) return null;

    return this.cipher.seal(runId, identity as LiveRunIdentity);
  }

  // ── Input handling ─────────────────────────────────────────────────────────

  private toColumns(
    input: LiveRunSyncInput,
    existing: Pick<LiveRunRow, 'identityPurgedAt'> | null,
  ): LiveRunColumns {
    const sealed = this.sealIdentity(input.identity, input.id, existing);

    return {
      revision: input.revision,
      state: input.state as never,
      startedAt: new Date(input.startedAt),

      externalReference: input.externalReference?.trim() || null,
      chiefComplaint: input.chiefComplaint?.trim() || null,
      locationType: (input.locationType ?? null) as never,
      localityId: input.localityId || null,
      victimGender: (input.victimGender ?? null) as never,
      victimAge: input.victimAge ?? null,
      vehicleId: input.vehicleId || null,

      scheduleId: input.shift?.scheduleId ?? null,
      shiftDate: input.shift ? parseIsoDate(input.shift.date) : null,
      shiftSlot: input.shift?.slot ?? null,

      activationAt: toDate(input.activationAt),
      sceneArrivalAt: toDate(input.sceneArrivalAt),
      sceneDepartureAt: toDate(input.sceneDepartureAt),
      hospitalArrivalAt: toDate(input.hospitalArrivalAt),
      availableAt: toDate(input.availableAt),

      destinationKind: (input.destinationKind ?? null) as never,
      destinationHospitalId: input.destinationHospitalId || null,

      capture: (input.capture ?? Prisma.DbNull) as never,
      ...(sealed === undefined ? {} : { identity: sealed as never }),
    };
  }

  private toCrewRows(input: LiveRunSyncInput) {
    return (input.crew ?? []).map((member, index) => ({
      userId: member.userId,
      roleName: member.roleName?.trim() || null,
      position: index,
    }));
  }

  /**
   * Foreign keys, checked with a message that names what is wrong.
   *
   * Prisma would raise these as P2003 on write, but "Foreign key constraint
   * failed on the field: `localityId`" is not something to show a crew mid-call.
   */
  private async assertReferencesExist(input: LiveRunSyncInput): Promise<void> {
    const crewIds = (input.crew ?? []).map((member) => member.userId);
    const [locality, vehicle, hospital, schedule, users] = await Promise.all([
      input.localityId
        ? this.prisma.locality.count({ where: { id: input.localityId } })
        : 1,
      input.vehicleId ? this.prisma.vehicle.count({ where: { id: input.vehicleId } }) : 1,
      input.destinationHospitalId
        ? this.prisma.hospital.count({ where: { id: input.destinationHospitalId } })
        : 1,
      input.shift?.scheduleId
        ? this.prisma.schedule.count({ where: { id: input.shift.scheduleId } })
        : 1,
      crewIds.length
        ? this.prisma.user.findMany({ where: { id: { in: crewIds } }, select: { id: true } })
        : [],
    ]);

    if (!locality) throw new BadRequestException('That locality does not exist.');
    if (!vehicle) throw new BadRequestException('That vehicle does not exist.');
    if (!hospital) throw new BadRequestException('That hospital does not exist.');
    if (!schedule) throw new BadRequestException('That shift schedule does not exist.');

    const found = new Set((users as Array<{ id: string }>).map((row) => row.id));
    const missing = crewIds.filter((id) => !found.has(id));
    if (missing.length) {
      throw new BadRequestException(`These crew members do not exist: ${missing.join(', ')}.`);
    }
  }

  /**
   * A stored run back in the shape its own rules read.
   *
   * The same trick as `reportRowToInput`: closing and validating both have to
   * reason about what is *stored*, and the domain functions only speak the input
   * shape. Identity is opened here because `liveRunToEventReportInput` drops
   * every identity field anyway — passing it in and having it dropped in one
   * provable place is better than deciding again at the call site.
   */
  private rowToInput(row: LiveRunRow): LiveRunSyncInput {
    const run = serializeLiveRun(row, this.openIdentity(row));
    return {
      id: run.id,
      revision: run.revision,
      state: run.state,
      startedAt: run.startedAt,
      externalReference: run.externalReference ?? null,
      chiefComplaint: run.chiefComplaint ?? null,
      locationType: run.locationType ?? null,
      localityId: run.localityId ?? null,
      victimGender: run.victimGender ?? null,
      victimAge: run.victimAge ?? null,
      vehicleId: run.vehicleId ?? null,
      crew: run.crew.map((member) => ({
        userId: member.userId,
        roleName: member.roleName ?? null,
      })),
      shift: run.shift ?? null,
      activationAt: run.activationAt ?? null,
      sceneArrivalAt: run.sceneArrivalAt ?? null,
      sceneDepartureAt: run.sceneDepartureAt ?? null,
      hospitalArrivalAt: run.hospitalArrivalAt ?? null,
      availableAt: run.availableAt ?? null,
      destinationKind: run.destinationKind ?? null,
      destinationHospitalId: run.destinationHospitalId ?? null,
      identity: run.identity ?? null,
      capture: run.capture ?? null,
      closedAt: run.closedAt ?? null,
    };
  }

}

const toDate = (value: string | null | undefined): Date | null =>
  value ? new Date(value) : null;
