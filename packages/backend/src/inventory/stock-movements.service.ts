import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryItemType, StockMovementReason } from '@redinfo/shared';

type Tx = Prisma.TransactionClient;

/** One line of material consumption, as #204's report editor will produce it. */
export interface ConsumptionLineInput {
  materialItemId: string;
  vehicleId: string;
  /** Units requested, always positive — the engine negates it for the ledger. */
  quantity: number;
}

/**
 * The stock delta ledger + deduction engine behind event-report material
 * consumption (#203). Built ahead of the consumption-lines model itself
 * (#204, "pairs with" this task): `applyReportConsumption` takes the
 * report's current lines as an explicit argument rather than reading them
 * off `EventReport`, so #204's submit hook can call straight into this once
 * it lands, and `reverseReportConsumption` does the same for report
 * deletion.
 */
@Injectable()
export class StockMovementsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Applies (or re-applies) a report's material consumption to vehicle
   * stock. Idempotent: any `CONSUMPTION` movements already on this report
   * are undone first (the inverse of their `delta` is added back to
   * `VehicleInventoryItem.actualQuantity`), then `lines` is applied fresh —
   * so editing and re-submitting a report converges instead of
   * double-counting.
   *
   * `UNLIMITED` items are skipped entirely: no movement, no stock effect —
   * they're recorded on the report only.
   */
  async applyReportConsumption(
    reportId: string,
    lines: ConsumptionLineInput[],
    actorId: string | null,
    tx?: Tx,
  ): Promise<void> {
    const run = (t: Tx) => this.applyReportConsumptionTx(t, reportId, lines, actorId);
    return tx ? run(tx) : this.prisma.$transaction((t) => run(t));
  }

  /**
   * Undoes a report's `CONSUMPTION` movements without re-applying anything —
   * used when a submitted report is deleted.
   */
  async reverseReportConsumption(reportId: string, tx?: Tx): Promise<void> {
    return tx ? this.reverseConsumption(tx, reportId) : this.prisma.$transaction((t) => this.reverseConsumption(t, reportId));
  }

  /**
   * Paged, newest-first movement history for a vehicle's stock. `actorId`
   * has no Prisma relation to `User` (see the schema comment on
   * `StockMovement`), so the actor's name is resolved with a second, batched
   * lookup rather than an `include` — mirroring the `{id, firstName,
   * lastName}` shape `createdBy` uses elsewhere (e.g. `SchedulesService`)
   * instead of leaving the frontend to resolve a bare id.
   */
  async findByVehicle(vehicleId: string, page = 1, perPage = 50) {
    const skip = (page - 1) * perPage;
    const [movements, total] = await this.prisma.$transaction([
      this.prisma.stockMovement.findMany({
        where: { vehicleId },
        skip,
        take: perPage,
        orderBy: { occurredAt: 'desc' },
        include: { materialItem: true },
      }),
      this.prisma.stockMovement.count({ where: { vehicleId } }),
    ]);

    const actorIds = [...new Set(movements.map((m) => m.actorId).filter((id): id is string => !!id))];
    const actors = actorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const actorById = new Map(actors.map((actor) => [actor.id, actor]));

    const data = movements.map((movement) => ({
      ...movement,
      actor: movement.actorId ? (actorById.get(movement.actorId) ?? null) : null,
    }));

    return { data, total, page, perPage };
  }

  /**
   * Writes a `MANUAL_ADJUSTMENT`/`IMPORT` movement for a hand-edited or
   * CSV-imported vehicle inventory item — called from
   * `InventoryService.upsertVehicleInventoryItem` /
   * `updateVehicleInventoryItem`. A no-op for `UNLIMITED` items (no
   * quantity to move), for a template item that predates the catalogue
   * migration and has no `materialItemId` yet, or when nothing actually
   * changed.
   */
  async recordManualAdjustment(
    tx: Tx,
    params: {
      vehicleId: string;
      materialItemId: string | null | undefined;
      itemType: InventoryItemType;
      oldQuantity: number | null;
      newQuantity: number | null;
      actorId: string | null;
      reason: StockMovementReason.MANUAL_ADJUSTMENT | StockMovementReason.IMPORT;
    },
  ): Promise<void> {
    if (!params.materialItemId || params.itemType === InventoryItemType.UNLIMITED) return;

    const delta = (params.newQuantity ?? 0) - (params.oldQuantity ?? 0);
    if (delta === 0) return;

    await tx.stockMovement.create({
      data: {
        vehicleId: params.vehicleId,
        materialItemId: params.materialItemId,
        delta,
        reason: params.reason,
        actorId: params.actorId,
      },
    });
  }

  private async applyReportConsumptionTx(
    tx: Tx,
    reportId: string,
    lines: ConsumptionLineInput[],
    actorId: string | null,
  ): Promise<void> {
    await this.reverseConsumption(tx, reportId);
    for (const line of lines) {
      await this.consumeOne(tx, reportId, actorId, line);
    }
  }

  private async reverseConsumption(tx: Tx, reportId: string): Promise<void> {
    const existing = await tx.stockMovement.findMany({
      where: { reportId, reason: StockMovementReason.CONSUMPTION },
    });

    for (const movement of existing) {
      // The inverse of what was deducted, added back. A reversal never sets
      // `needsRecount` — the flag it may be clearing was earned by the
      // deduction it is undoing, not by this step.
      await this.adjustVehicleStock(tx, movement.vehicleId, movement.materialItemId, -movement.delta, {
        flagOnFloor: false,
      });
    }

    await tx.stockMovement.deleteMany({ where: { reportId, reason: StockMovementReason.CONSUMPTION } });
  }

  private async consumeOne(
    tx: Tx,
    reportId: string,
    actorId: string | null,
    line: ConsumptionLineInput,
  ): Promise<void> {
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      throw new BadRequestException(
        `Consumption quantity for material item ${line.materialItemId} must be a positive integer`,
      );
    }

    const materialItem = await tx.materialItem.findUnique({ where: { id: line.materialItemId } });
    if (!materialItem) throw new NotFoundException(`Material item ${line.materialItemId} not found`);
    if (materialItem.type === InventoryItemType.UNLIMITED) return; // logged on the report only

    const delta = -line.quantity;
    await this.adjustVehicleStock(tx, line.vehicleId, line.materialItemId, delta, { flagOnFloor: true });

    await tx.stockMovement.create({
      data: {
        vehicleId: line.vehicleId,
        materialItemId: line.materialItemId,
        delta,
        reason: StockMovementReason.CONSUMPTION,
        reportId,
        actorId,
      },
    });
  }

  /**
   * Applies `delta` to the `VehicleInventoryItem` backing `(vehicleId,
   * materialItemId)`, floor-at-zero. A no-op on the stock side when the
   * vehicle's assigned template has no item for this material at all — the
   * `StockMovement` row already written (or about to be) is the source of
   * truth for what was consumed; inventing a template row for it is out of
   * scope here.
   */
  private async adjustVehicleStock(
    tx: Tx,
    vehicleId: string,
    materialItemId: string,
    delta: number,
    opts: { flagOnFloor: boolean },
  ): Promise<void> {
    const vehicle = await tx.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) return;

    const template = await tx.inventoryTemplate.findUnique({ where: { vehicleType: vehicle.vehicleType } });
    if (!template) return;

    const templateItem = await tx.inventoryTemplateItem.findFirst({
      where: { templateId: template.id, materialItemId },
    });
    if (!templateItem) return;

    const existing = await tx.vehicleInventoryItem.findUnique({
      where: { vehicleId_templateItemId: { vehicleId, templateItemId: templateItem.id } },
    });

    const before = existing?.actualQuantity ?? 0;
    const raw = before + delta;
    const after = Math.max(0, raw);
    const floored = raw < 0;

    if (!existing) {
      // A crew spending something the stock list never knew about is a
      // signal, not an error — the row is created at 0 and flagged. (Only
      // reachable from a reversal if the row was removed out-of-band since
      // the consumption that created it — `flagOnFloor` still governs it.)
      await tx.vehicleInventoryItem.create({
        data: {
          vehicleId,
          templateItemId: templateItem.id,
          actualQuantity: after,
          templateVersion: template.version,
          needsRecount: opts.flagOnFloor,
        },
      });
      return;
    }

    await tx.vehicleInventoryItem.update({
      where: { id: existing.id },
      data: {
        actualQuantity: after,
        needsRecount: opts.flagOnFloor ? existing.needsRecount || floored : existing.needsRecount,
      },
    });
  }
}
