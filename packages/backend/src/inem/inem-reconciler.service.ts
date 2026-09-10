import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { INEM_AVAILABLE_INOP_CODE, normalizeLicensePlate } from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { InemApiClient, InemSessionExpiredError, InemUnitApiRow } from './inem-api.client';
import { InemQueueService, INEM_KEEPALIVE_SAML_QUEUE } from './inem-queue.service';
import { InemSessionService } from './inem-session.service';

/** Only one reconcile pass runs at a time — a second overlapping pass is what could push a stale write out of order. */
const RECONCILE_LOCK_SQL = Prisma.sql`SELECT pg_advisory_xact_lock(hashtext('inem-reconcile')::bigint)`;

/**
 * The reconciler and both keep-alive layers (#214) — the three scheduled
 * jobs registered on `InemQueueService`.
 *
 * Unit state is desired vs. reported, never a fire-and-forget command: this
 * is what pushes a diverging `desiredInopCode` to INEM and polls
 * `reportedInopCode` back, in one pass, so a coordinator's change made
 * directly in INEM's own portal is picked up too.
 */
@Injectable()
export class InemReconcilerService implements OnModuleInit {
  private readonly logger = new Logger(InemReconcilerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: InemApiClient,
    private readonly session: InemSessionService,
    private readonly queue: InemQueueService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.workReconcile(() => this.reconcile());
    await this.queue.workKeepaliveSession(() => this.session.pingStatistics());
    await this.queue.work(INEM_KEEPALIVE_SAML_QUEUE, () => this.session.proactiveReMint());
  }

  /**
   * Runs one reconcile pass right away, outside the scheduled chain — used
   * when a coordinator saves a unit's desired status so the push to INEM
   * starts immediately instead of sitting for up to the loop's own delay
   * (see `InemQueueService.workReconcile`). Errors are logged, not thrown:
   * the caller already committed its own write and must not fail because a
   * live INEM round trip hiccuped — the next scheduled pass retries
   * regardless, same as any other reconcile failure.
   */
  triggerNow(): void {
    this.reconcile().catch((err) => this.logger.warn(`Immediate reconcile pass failed: ${err.message}`));
  }

  async reconcile(): Promise<void> {
    if (!this.session.isEnabled) return;

    // The lock and every Prisma write live in one transaction; the two
    // outbound INEM calls happen inside it too. Simple over clever: this
    // mirrors `EventReportNumbering`'s own `pg_advisory_xact_lock` pattern,
    // and INEM's own unit count is small enough that holding one Postgres
    // connection for the length of two HTTP round trips is a non-issue.
    const outcome = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw(RECONCILE_LOCK_SQL);
        return this.reconcileLocked(tx);
      },
      { timeout: 20_000 },
    );

    // Recovery/health-marking/failure-recording deliberately run *after* this
    // transaction has committed — all three open their own, and nesting any
    // of them inside this one buys nothing but a second connection held idle.
    switch (outcome.kind) {
      case 'session-expired':
        await this.session.recover();
        break;
      case 'ok':
        // The two INEM calls above just succeeded with the current cookies —
        // clear a stale `EXPIRED` flag left over from an earlier transient
        // failure that never got a chance to self-correct.
        await this.session.markHealthy();
        break;
      case 'api-error':
        await this.session.recordApiFailure(outcome.error);
        break;
    }
  }

  /**
   * `'session-expired'` when the cookies turned out to be dead and recovery
   * should run once this transaction is done; `'api-error'` when INEM was
   * reached but answered with something else (a bad status, a malformed
   * body) — carries the error so `reconcile()` can hand it to the breaker
   * *after* this transaction commits, not from in here (see that method's
   * own comment on why). Either error case still lets a `syncUnits` write
   * that already ran (e.g. the batch push after the two `GET`s failed)
   * commit — partial progress from this pass is still real progress.
   */
  private async reconcileLocked(
    tx: Prisma.TransactionClient,
  ): Promise<{ kind: 'ok' } | { kind: 'session-expired' } | { kind: 'api-error'; error: unknown }> {
    const cookies = await this.session.getCookiesOrNull();
    if (!cookies) return { kind: 'session-expired' };
    const entity = this.session.entityId;

    try {
      const [units, inopReasons] = await Promise.all([
        this.client.getUnits(cookies, entity),
        this.client.getInopReasons(cookies),
      ]);
      await this.session.setCachedInopReasons(inopReasons);
      await this.syncUnits(tx, units);

      const pending = await this.buildPendingBatch(tx);
      if (Object.keys(pending).length > 0) {
        await this.client.putUnits(cookies, entity, pending);
        await this.markPushed(tx, pending);
      }
      return { kind: 'ok' };
    } catch (err) {
      if (err instanceof InemSessionExpiredError) return { kind: 'session-expired' };
      return { kind: 'api-error', error: err };
    }
  }

  /**
   * Upserts `INEMUnit` rows from the latest `GET /api/unit`, joining to
   * `Vehicle` by licence plate. Never touches `desiredInopCode` — that's the
   * coordinator's field, not the reconciler's.
   *
   * `INOPReason` being absent is read as available (`INEM_AVAILABLE_INOP_CODE`)
   * — unconfirmed by a live capture of an available unit (see
   * `docs/inem-portal-contract.md`'s open questions), the best inference
   * from the documented shape, and worth re-checking against a real
   * available-unit response.
   */
  private async syncUnits(tx: Prisma.TransactionClient, units: InemUnitApiRow[]): Promise<void> {
    const vehicleIdByPlate = await this.loadVehicleIdsByNormalizedPlate(tx);

    for (const unit of units) {
      const vehicleId = unit.CarID ? vehicleIdByPlate.get(normalizeLicensePlate(unit.CarID)) ?? null : null;

      await tx.iNEMUnit.upsert({
        where: { unitId: unit.UnitID },
        create: {
          unitId: unit.UnitID,
          station: unit.Station,
          carId: unit.CarID,
          unitType: unit.UnitType,
          reportedInopCode: unit.INOPReason ?? INEM_AVAILABLE_INOP_CODE,
          reportedActive: unit.Active,
          vehicleId,
          lastSyncedAt: new Date(),
          lastError: null,
        },
        update: {
          station: unit.Station,
          carId: unit.CarID,
          unitType: unit.UnitType,
          reportedInopCode: unit.INOPReason ?? INEM_AVAILABLE_INOP_CODE,
          reportedActive: unit.Active,
          vehicleId,
          lastSyncedAt: new Date(),
          lastError: null,
        },
      });
    }
  }

  /**
   * Keyed by `normalizeLicensePlate`, not the raw string: INEM's own `CarID`
   * comes back dashless (`"80PS45"`) while `Vehicle.licensePlate` is always
   * stored dashed (`"80-PS-45"`) — an exact-match lookup never joins the two
   * to the same vehicle even though it's the same ambulance (#218). Loaded
   * once per reconcile pass rather than per unit; the fleet is small enough
   * that this is cheaper than N lookups and the aggregate connection time is
   * the same either way.
   */
  private async loadVehicleIdsByNormalizedPlate(tx: Prisma.TransactionClient): Promise<Map<string, string>> {
    const vehicles = await tx.vehicle.findMany({ select: { id: true, licensePlate: true } });
    return new Map(vehicles.map((v) => [normalizeLicensePlate(v.licensePlate), v.id]));
  }

  /** Units whose desired state has never been set are excluded — pushing nothing is not the same as pushing "available". */
  private async buildPendingBatch(tx: Prisma.TransactionClient): Promise<Record<string, { INOP: string }>> {
    const candidates = await tx.iNEMUnit.findMany({
      where: { desiredInopCode: { not: null } },
      select: { unitId: true, desiredInopCode: true, reportedInopCode: true },
    });

    const pending: Record<string, { INOP: string }> = {};
    for (const unit of candidates) {
      if (unit.desiredInopCode && unit.desiredInopCode !== unit.reportedInopCode) {
        pending[unit.unitId] = { INOP: unit.desiredInopCode };
      }
    }
    return pending;
  }

  /**
   * Optimistically marks pushed units as synced. The *next* reconcile pass's
   * `GET /api/unit` is still the source of truth and will correct this if
   * INEM disagreed — this just avoids a full extra minute of "still syncing"
   * in the UI for the common case where the push succeeded.
   */
  private async markPushed(tx: Prisma.TransactionClient, pending: Record<string, { INOP: string }>): Promise<void> {
    const now = new Date();
    for (const [unitId, { INOP }] of Object.entries(pending)) {
      await tx.iNEMUnit.update({
        where: { unitId },
        data: { reportedInopCode: INOP, lastSyncedAt: now },
      });
    }
  }
}
