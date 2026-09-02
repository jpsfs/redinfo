import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { INEM_AVAILABLE_INOP_CODE } from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { InemApiClient, InemSessionExpiredError, InemUnitApiRow } from './inem-api.client';
import { InemQueueService, INEM_KEEPALIVE_SAML_QUEUE, INEM_KEEPALIVE_SESSION_QUEUE, INEM_RECONCILE_QUEUE } from './inem-queue.service';
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
    await this.queue.work(INEM_RECONCILE_QUEUE, () => this.reconcile());
    await this.queue.work(INEM_KEEPALIVE_SESSION_QUEUE, () => this.session.pingStatistics());
    await this.queue.work(INEM_KEEPALIVE_SAML_QUEUE, () => this.session.proactiveReMint());
  }

  async reconcile(): Promise<void> {
    if (!this.session.isEnabled) return;

    // The lock and every Prisma write live in one transaction; the two
    // outbound INEM calls happen inside it too. Simple over clever: this
    // mirrors `EventReportNumbering`'s own `pg_advisory_xact_lock` pattern,
    // and INEM's own unit count is small enough that holding one Postgres
    // connection for the length of two HTTP round trips is a non-issue.
    const needsRecovery = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw(RECONCILE_LOCK_SQL);
        return this.reconcileLocked(tx);
      },
      { timeout: 20_000 },
    );

    // Recovery deliberately runs *after* this transaction has committed —
    // `InemSessionService.recover()` opens its own transaction, and nesting
    // that inside this one buys nothing but a second connection held idle.
    if (needsRecovery) await this.session.recover();
  }

  /** Returns `true` when the session turned out to be dead and recovery should run once this transaction is done. */
  private async reconcileLocked(tx: Prisma.TransactionClient): Promise<boolean> {
    const cookies = await this.session.getCookiesOrNull();
    if (!cookies) return true;
    const entity = this.session.entityId;

    try {
      const [units, inopReasons] = await Promise.all([
        this.client.getUnits(cookies, entity),
        this.client.getInopReasons(cookies),
      ]);
      this.session.setCachedInopReasons(inopReasons);
      await this.syncUnits(tx, units);

      const pending = await this.buildPendingBatch(tx);
      if (Object.keys(pending).length > 0) {
        await this.client.putUnits(cookies, entity, pending);
        await this.markPushed(tx, pending);
      }
      return false;
    } catch (err) {
      if (err instanceof InemSessionExpiredError) return true;
      throw err;
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
    for (const unit of units) {
      const vehicle = unit.CarID
        ? await tx.vehicle.findUnique({ where: { licensePlate: unit.CarID }, select: { id: true } })
        : null;

      await tx.iNEMUnit.upsert({
        where: { unitId: unit.UnitID },
        create: {
          unitId: unit.UnitID,
          station: unit.Station,
          carId: unit.CarID,
          unitType: unit.UnitType,
          reportedInopCode: unit.INOPReason ?? INEM_AVAILABLE_INOP_CODE,
          reportedActive: unit.Active,
          vehicleId: vehicle?.id ?? null,
          lastSyncedAt: new Date(),
          lastError: null,
        },
        update: {
          station: unit.Station,
          carId: unit.CarID,
          unitType: unit.UnitType,
          reportedInopCode: unit.INOPReason ?? INEM_AVAILABLE_INOP_CODE,
          reportedActive: unit.Active,
          vehicleId: vehicle?.id ?? null,
          lastSyncedAt: new Date(),
          lastError: null,
        },
      });
    }
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
