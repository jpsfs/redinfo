import { NotFoundException, BadRequestException } from '@nestjs/common';
import { StockMovementsService } from './stock-movements.service';
import { InventoryItemType, StockMovementReason } from '@redinfo/shared';

// ── helpers ────────────────────────────────────────────────────────────────────

const VEHICLE = { id: 'v1', vehicleType: 'EMERGENCY' };
const TEMPLATE = { id: 'tpl-1', vehicleType: 'EMERGENCY', version: 1 };
const GLOVES = { id: 'mi-gloves', type: InventoryItemType.COUNTABLE };
const BANDAGES = { id: 'mi-bandages', type: InventoryItemType.UNLIMITED };
const GLOVES_TEMPLATE_ITEM = { id: 'ti-gloves', templateId: 'tpl-1', materialItemId: 'mi-gloves' };

/**
 * A minimal in-memory stand-in for the tables `StockMovementsService`
 * touches, so a test can seed starting stock, drive the service through a
 * sequence of calls (submit, edit, delete), and assert on the *converged*
 * state — the thing that actually matters for an idempotent ledger.
 */
function buildFakeTx(seedVehicleInventory: Array<Record<string, unknown>> = []) {
  let idSeq = 0;
  const vehicleInventoryItems = new Map<string, Record<string, unknown>>();
  for (const row of seedVehicleInventory) {
    vehicleInventoryItems.set(`${row.vehicleId}:${row.templateItemId}`, { needsRecount: false, ...row });
  }
  const stockMovements: Array<Record<string, unknown>> = [];
  const materialItems: Record<string, unknown> = { [GLOVES.id]: GLOVES, [BANDAGES.id]: BANDAGES };
  const templateItems: Record<string, { id: string; templateId: string; materialItemId: string }> = {
    [GLOVES_TEMPLATE_ITEM.id]: GLOVES_TEMPLATE_ITEM,
  };

  const tx = {
    vehicle: {
      findUnique: jest.fn(async ({ where: { id } }: { where: { id: string } }) =>
        id === VEHICLE.id ? VEHICLE : null,
      ),
    },
    inventoryTemplate: {
      findUnique: jest.fn(async ({ where: { vehicleType } }: { where: { vehicleType: string } }) =>
        vehicleType === TEMPLATE.vehicleType ? TEMPLATE : null,
      ),
    },
    inventoryTemplateItem: {
      findFirst: jest.fn(
        async ({ where }: { where: { templateId: string; materialItemId: string } }) =>
          Object.values(templateItems).find(
            (t) => t.templateId === where.templateId && t.materialItemId === where.materialItemId,
          ) ?? null,
      ),
    },
    vehicleInventoryItem: {
      findUnique: jest.fn(
        async ({ where }: { where: { vehicleId_templateItemId: { vehicleId: string; templateItemId: string } } }) => {
          const { vehicleId, templateItemId } = where.vehicleId_templateItemId;
          return vehicleInventoryItems.get(`${vehicleId}:${templateItemId}`) ?? null;
        },
      ),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `vi-${++idSeq}`, ...data };
        vehicleInventoryItems.set(`${data.vehicleId}:${data.templateItemId}`, row);
        return row;
      }),
      update: jest.fn(
        async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const entry = [...vehicleInventoryItems.entries()].find(([, v]) => v.id === where.id);
          if (!entry) throw new Error(`no seeded VehicleInventoryItem with id ${where.id}`);
          const updated = { ...entry[1], ...data };
          vehicleInventoryItems.set(entry[0], updated);
          return updated;
        },
      ),
    },
    materialItem: {
      findUnique: jest.fn(async ({ where: { id } }: { where: { id: string } }) => materialItems[id] ?? null),
    },
    stockMovement: {
      findMany: jest.fn(async ({ where }: { where: { reportId: string; reason: string } }) =>
        stockMovements.filter((m) => m.reportId === where.reportId && m.reason === where.reason),
      ),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `sm-${++idSeq}`, occurredAt: new Date(), ...data };
        stockMovements.push(row);
        return row;
      }),
      deleteMany: jest.fn(async ({ where }: { where: { reportId: string; reason: string } }) => {
        const before = stockMovements.length;
        for (let i = stockMovements.length - 1; i >= 0; i--) {
          if (stockMovements[i].reportId === where.reportId && stockMovements[i].reason === where.reason) {
            stockMovements.splice(i, 1);
          }
        }
        return { count: before - stockMovements.length };
      }),
    },
  };

  return { tx, vehicleInventoryItems, stockMovements };
}

function buildService(tx: ReturnType<typeof buildFakeTx>['tx']) {
  const prisma = {
    ...tx,
    $transaction: jest.fn((arg: unknown) => (typeof arg === 'function' ? (arg as (t: unknown) => unknown)(tx) : Promise.all(arg as unknown[]))),
  };
  return new StockMovementsService(prisma as never);
}

function vi(fake: ReturnType<typeof buildFakeTx>) {
  return fake.vehicleInventoryItems.get(`${VEHICLE.id}:${GLOVES_TEMPLATE_ITEM.id}`) as
    | { actualQuantity: number; needsRecount: boolean }
    | undefined;
}

// ── StockMovementsService unit tests ────────────────────────────────────────────

describe('StockMovementsService', () => {
  describe('applyReportConsumption', () => {
    it('floors actualQuantity at zero and flags needsRecount on over-consumption', async () => {
      const fake = buildFakeTx([
        { id: 'vi-1', vehicleId: VEHICLE.id, templateItemId: GLOVES_TEMPLATE_ITEM.id, actualQuantity: 3, templateVersion: 1 },
      ]);
      const service = buildService(fake.tx);

      await service.applyReportConsumption(
        'report-1',
        [{ materialItemId: GLOVES.id, vehicleId: VEHICLE.id, quantity: 5 }],
        'user-1',
        fake.tx as never,
      );

      expect(vi(fake)).toMatchObject({ actualQuantity: 0, needsRecount: true });
      expect(fake.stockMovements).toHaveLength(1);
      expect(fake.stockMovements[0]).toMatchObject({
        delta: -5,
        reason: StockMovementReason.CONSUMPTION,
        reportId: 'report-1',
        vehicleId: VEHICLE.id,
        materialItemId: GLOVES.id,
      });
    });

    it('does not flag needsRecount when consumption lands exactly on or above zero', async () => {
      const fake = buildFakeTx([
        { id: 'vi-1', vehicleId: VEHICLE.id, templateItemId: GLOVES_TEMPLATE_ITEM.id, actualQuantity: 5, templateVersion: 1 },
      ]);
      const service = buildService(fake.tx);

      await service.applyReportConsumption(
        'report-1',
        [{ materialItemId: GLOVES.id, vehicleId: VEHICLE.id, quantity: 5 }],
        null,
        fake.tx as never,
      );

      expect(vi(fake)).toMatchObject({ actualQuantity: 0, needsRecount: false });
    });

    it('re-submitting the same lines converges instead of double-deducting', async () => {
      const fake = buildFakeTx([
        { id: 'vi-1', vehicleId: VEHICLE.id, templateItemId: GLOVES_TEMPLATE_ITEM.id, actualQuantity: 10, templateVersion: 1 },
      ]);
      const service = buildService(fake.tx);
      const lines = [{ materialItemId: GLOVES.id, vehicleId: VEHICLE.id, quantity: 2 }];

      await service.applyReportConsumption('report-1', lines, 'user-1', fake.tx as never);
      await service.applyReportConsumption('report-1', lines, 'user-1', fake.tx as never);

      expect(vi(fake)).toMatchObject({ actualQuantity: 8 });
      expect(fake.stockMovements).toHaveLength(1); // still exactly one CONSUMPTION movement
    });

    it('editing the quantity and re-submitting converges on the new amount', async () => {
      const fake = buildFakeTx([
        { id: 'vi-1', vehicleId: VEHICLE.id, templateItemId: GLOVES_TEMPLATE_ITEM.id, actualQuantity: 10, templateVersion: 1 },
      ]);
      const service = buildService(fake.tx);

      await service.applyReportConsumption(
        'report-1',
        [{ materialItemId: GLOVES.id, vehicleId: VEHICLE.id, quantity: 2 }],
        'user-1',
        fake.tx as never,
      );
      expect(vi(fake)).toMatchObject({ actualQuantity: 8 });

      await service.applyReportConsumption(
        'report-1',
        [{ materialItemId: GLOVES.id, vehicleId: VEHICLE.id, quantity: 5 }],
        'user-1',
        fake.tx as never,
      );

      expect(vi(fake)).toMatchObject({ actualQuantity: 5 });
      expect(fake.stockMovements).toHaveLength(1);
      expect(fake.stockMovements[0]).toMatchObject({ delta: -5 });
    });

    it('UNLIMITED items produce no movement and no stock effect', async () => {
      const fake = buildFakeTx();
      const service = buildService(fake.tx);

      await service.applyReportConsumption(
        'report-1',
        [{ materialItemId: BANDAGES.id, vehicleId: VEHICLE.id, quantity: 100 }],
        'user-1',
        fake.tx as never,
      );

      expect(fake.stockMovements).toHaveLength(0);
      expect(fake.tx.vehicleInventoryItem.create).not.toHaveBeenCalled();
      expect(fake.tx.vehicleInventoryItem.update).not.toHaveBeenCalled();
    });

    it('creates a missing VehicleInventoryItem row at zero and flags it when the sheet never tracked the item', async () => {
      const fake = buildFakeTx(); // no seeded row at all
      const service = buildService(fake.tx);

      await service.applyReportConsumption(
        'report-1',
        [{ materialItemId: GLOVES.id, vehicleId: VEHICLE.id, quantity: 2 }],
        'user-1',
        fake.tx as never,
      );

      expect(vi(fake)).toMatchObject({ actualQuantity: 0, needsRecount: true });
    });

    it('rejects a non-positive quantity', async () => {
      const fake = buildFakeTx();
      const service = buildService(fake.tx);

      await expect(
        service.applyReportConsumption(
          'report-1',
          [{ materialItemId: GLOVES.id, vehicleId: VEHICLE.id, quantity: 0 }],
          'user-1',
          fake.tx as never,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException for an unknown material item', async () => {
      const fake = buildFakeTx();
      const service = buildService(fake.tx);

      await expect(
        service.applyReportConsumption(
          'report-1',
          [{ materialItemId: 'mi-missing', vehicleId: VEHICLE.id, quantity: 1 }],
          'user-1',
          fake.tx as never,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('reverseReportConsumption', () => {
    it('undoes a report’s consumption without re-applying anything', async () => {
      const fake = buildFakeTx([
        { id: 'vi-1', vehicleId: VEHICLE.id, templateItemId: GLOVES_TEMPLATE_ITEM.id, actualQuantity: 10, templateVersion: 1 },
      ]);
      const service = buildService(fake.tx);

      await service.applyReportConsumption(
        'report-1',
        [{ materialItemId: GLOVES.id, vehicleId: VEHICLE.id, quantity: 3 }],
        'user-1',
        fake.tx as never,
      );
      expect(vi(fake)).toMatchObject({ actualQuantity: 7 });

      await service.reverseReportConsumption('report-1', fake.tx as never);

      expect(vi(fake)).toMatchObject({ actualQuantity: 10 });
      expect(fake.stockMovements).toHaveLength(0);
    });

    it('never sets needsRecount as a side effect of reversing', async () => {
      const fake = buildFakeTx([
        { id: 'vi-1', vehicleId: VEHICLE.id, templateItemId: GLOVES_TEMPLATE_ITEM.id, actualQuantity: 2, templateVersion: 1 },
      ]);
      const service = buildService(fake.tx);

      // Over-consumes and floors — needsRecount goes true.
      await service.applyReportConsumption(
        'report-1',
        [{ materialItemId: GLOVES.id, vehicleId: VEHICLE.id, quantity: 5 }],
        'user-1',
        fake.tx as never,
      );
      expect(vi(fake)).toMatchObject({ actualQuantity: 0, needsRecount: true });

      // Reversal adds back the full requested delta (the ledger's `delta`,
      // not the clamped stock effect) — for an over-consumption that
      // overshoots the original quantity, which is expected: the flag
      // stays put either way, telling a human this row needs a real count
      // rather than the engine's best guess.
      await service.reverseReportConsumption('report-1', fake.tx as never);
      expect(vi(fake)).toMatchObject({ actualQuantity: 5, needsRecount: true });
    });
  });

  describe('recordManualAdjustment', () => {
    it('writes a movement for the delta between old and new quantity', async () => {
      const fake = buildFakeTx();
      const service = buildService(fake.tx);

      await service.recordManualAdjustment(fake.tx as never, {
        vehicleId: VEHICLE.id,
        materialItemId: GLOVES.id,
        itemType: InventoryItemType.COUNTABLE,
        oldQuantity: 4,
        newQuantity: 9,
        actorId: 'user-1',
        reason: StockMovementReason.MANUAL_ADJUSTMENT,
      });

      expect(fake.stockMovements).toHaveLength(1);
      expect(fake.stockMovements[0]).toMatchObject({ delta: 5, reason: StockMovementReason.MANUAL_ADJUSTMENT });
    });

    it('tags CSV-imported adjustments with the IMPORT reason', async () => {
      const fake = buildFakeTx();
      const service = buildService(fake.tx);

      await service.recordManualAdjustment(fake.tx as never, {
        vehicleId: VEHICLE.id,
        materialItemId: GLOVES.id,
        itemType: InventoryItemType.COUNTABLE,
        oldQuantity: null,
        newQuantity: 20,
        actorId: null,
        reason: StockMovementReason.IMPORT,
      });

      expect(fake.stockMovements[0]).toMatchObject({ delta: 20, reason: StockMovementReason.IMPORT });
    });

    it('is a no-op when nothing changed', async () => {
      const fake = buildFakeTx();
      const service = buildService(fake.tx);

      await service.recordManualAdjustment(fake.tx as never, {
        vehicleId: VEHICLE.id,
        materialItemId: GLOVES.id,
        itemType: InventoryItemType.COUNTABLE,
        oldQuantity: 4,
        newQuantity: 4,
        actorId: 'user-1',
        reason: StockMovementReason.MANUAL_ADJUSTMENT,
      });

      expect(fake.stockMovements).toHaveLength(0);
    });

    it('is a no-op for UNLIMITED items', async () => {
      const fake = buildFakeTx();
      const service = buildService(fake.tx);

      await service.recordManualAdjustment(fake.tx as never, {
        vehicleId: VEHICLE.id,
        materialItemId: BANDAGES.id,
        itemType: InventoryItemType.UNLIMITED,
        oldQuantity: null,
        newQuantity: null,
        actorId: 'user-1',
        reason: StockMovementReason.MANUAL_ADJUSTMENT,
      });

      expect(fake.stockMovements).toHaveLength(0);
    });

    it('is a no-op when the template item predates the catalogue migration (no materialItemId)', async () => {
      const fake = buildFakeTx();
      const service = buildService(fake.tx);

      await service.recordManualAdjustment(fake.tx as never, {
        vehicleId: VEHICLE.id,
        materialItemId: null,
        itemType: InventoryItemType.COUNTABLE,
        oldQuantity: 1,
        newQuantity: 9,
        actorId: 'user-1',
        reason: StockMovementReason.MANUAL_ADJUSTMENT,
      });

      expect(fake.stockMovements).toHaveLength(0);
    });
  });

  describe('findByVehicle', () => {
    it('paginates, newest first', async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const count = jest.fn().mockResolvedValue(0);
      const prisma = {
        stockMovement: { findMany, count },
        $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
      };
      const service = new StockMovementsService(prisma as never);

      await service.findByVehicle(VEHICLE.id, 2, 10);

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { vehicleId: VEHICLE.id },
          skip: 10,
          take: 10,
          orderBy: { occurredAt: 'desc' },
        }),
      );
    });

    it('resolves each movement\'s actor by a single batched user lookup', async () => {
      const movements = [
        { id: 'mv-1', actorId: 'user-1', vehicleId: VEHICLE.id },
        { id: 'mv-2', actorId: 'user-2', vehicleId: VEHICLE.id },
        { id: 'mv-3', actorId: 'user-1', vehicleId: VEHICLE.id }, // same actor as mv-1
        { id: 'mv-4', actorId: null, vehicleId: VEHICLE.id }, // system movement
      ];
      const findMany = jest.fn().mockResolvedValue(movements);
      const count = jest.fn().mockResolvedValue(movements.length);
      const userFindMany = jest.fn().mockResolvedValue([
        { id: 'user-1', firstName: 'Ana', lastName: 'Silva' },
        { id: 'user-2', firstName: 'Bruno', lastName: 'Costa' },
      ]);
      const prisma = {
        stockMovement: { findMany, count },
        user: { findMany: userFindMany },
        $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
      };
      const service = new StockMovementsService(prisma as never);

      const result = await service.findByVehicle(VEHICLE.id);

      expect(userFindMany).toHaveBeenCalledTimes(1);
      expect(userFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: ['user-1', 'user-2'] } } }),
      );
      expect(result.data).toEqual([
        { ...movements[0], actor: { id: 'user-1', firstName: 'Ana', lastName: 'Silva' } },
        { ...movements[1], actor: { id: 'user-2', firstName: 'Bruno', lastName: 'Costa' } },
        { ...movements[2], actor: { id: 'user-1', firstName: 'Ana', lastName: 'Silva' } },
        { ...movements[3], actor: null },
      ]);
    });

    it('skips the user lookup entirely when the page has no actors', async () => {
      const findMany = jest.fn().mockResolvedValue([{ id: 'mv-1', actorId: null, vehicleId: VEHICLE.id }]);
      const count = jest.fn().mockResolvedValue(1);
      const userFindMany = jest.fn();
      const prisma = {
        stockMovement: { findMany, count },
        user: { findMany: userFindMany },
        $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
      };
      const service = new StockMovementsService(prisma as never);

      await service.findByVehicle(VEHICLE.id);

      expect(userFindMany).not.toHaveBeenCalled();
    });
  });
});
