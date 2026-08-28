import { PrismaClient } from '@prisma/client';
import { InventoryItemType, StockMovementReason, VehicleType } from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from './inventory.service';
import { StockMovementsService, ConsumptionLineInput } from './stock-movements.service';

/**
 * Integration coverage for #203's stock ledger against a real Postgres — the
 * unit spec (`stock-movements.service.spec.ts`) covers the same behaviour
 * against a mocked Prisma; this proves the floor-at-zero + `needsRecount`
 * write, the idempotent re-apply, and the report-delete reversal actually
 * hold together across real rows and foreign keys.
 *
 * `EventReport` has no consumption-lines model yet (#204, "pairs with" this
 * task, still open) — so rather than going through a report submission flow
 * that doesn't exist, this drives `StockMovementsService` directly with an
 * explicit `lines` array, exactly the shape #204's submit hook will pass
 * once it lands. The `EventReport` row itself is real, so `reportId` and its
 * `SetNull` foreign key are exercised for real.
 *
 * Skipped unless DATABASE_URL is set, and named so
 * `pnpm --filter backend test:integration` selects it.
 */
const describeIntegration = process.env.DATABASE_URL ? describe : describe.skip;

const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

describeIntegration('StockMovementsService (integration)', () => {
  const prisma = new PrismaClient() as unknown as PrismaService;
  const stockMovements = new StockMovementsService(prisma);
  const inventory = new InventoryService(prisma, stockMovements);

  let user: { id: string };
  let locality: { id: string };
  let vehicle: { id: string };
  let template: { id: string };
  let templateItem: { id: string };
  let materialItem: { id: string };
  const createdReportIds: string[] = [];
  let reportNumber = 1;

  // A filed report needs a `number` — assigned in real life by
  // `EventReportNumbering` on submit. Each report here uses a distinct one
  // within a made-up year, so this suite's `(type, year, number)` triples
  // can't collide with the real numbering behaviour other integration specs
  // exercise for `(EMERGENCY, <real year>)`.
  const makeReport = () =>
    prisma.eventReport.create({
      data: {
        type: 'EMERGENCY',
        number: reportNumber++,
        year: 2101,
        occurredOn: new Date('2026-01-01T00:00:00.000Z'),
        startedAt: new Date('2026-01-01T08:00:00.000Z'),
        locationType: 'ROAD',
        localityId: locality.id,
        operationalReport: '<p>Test</p>',
        createdById: user.id,
        submittedAt: new Date('2026-01-01T09:00:00.000Z'),
        submittedById: user.id,
      },
    });

  beforeAll(async () => {
    user = await prisma.user.create({
      data: {
        email: `stock-movements.${RUN}@inventory.test`,
        firstName: 'Stock',
        lastName: 'Test',
        role: 'EMERGENCY_OPERATIONAL',
        isActive: true,
      },
    });

    const municipality = await prisma.municipality.create({
      data: { ineCode: `IT-${RUN}-SM`, name: `Municipality ${RUN}`, district: `District ${RUN}`, latitude: 40.2, longitude: -8.4 },
    });
    locality = await prisma.locality.create({
      data: { name: `Locality ${RUN}`, searchName: `locality ${RUN}`, municipalityId: municipality.id },
    });

    vehicle = await prisma.vehicle.create({
      data: {
        licensePlate: `IT-${RUN}-SM`,
        numeroCauda: `IT-${RUN}-SM`,
        vehicleType: VehicleType.TRANSPORT,
        insuranceRenewalDate: new Date('2030-01-01T00:00:00.000Z'),
        nextImtInspectionDate: new Date('2030-01-01T00:00:00.000Z'),
      },
    });

    template = await prisma.inventoryTemplate.create({ data: { vehicleType: VehicleType.TRANSPORT } });
    materialItem = await prisma.materialItem.create({
      data: { namePt: `Luvas ${RUN}`, type: InventoryItemType.COUNTABLE },
    });
    templateItem = await prisma.inventoryTemplateItem.create({
      data: {
        templateId: template.id,
        materialItemId: materialItem.id,
        name: `Luvas ${RUN}`,
        type: InventoryItemType.COUNTABLE,
        recommendedQuantity: 8,
      },
    });
  });

  afterAll(async () => {
    if (createdReportIds.length) {
      await prisma.stockMovement.deleteMany({ where: { reportId: { in: createdReportIds } } });
      await prisma.eventReport.deleteMany({ where: { id: { in: createdReportIds } } });
    }
    await prisma.stockMovement.deleteMany({ where: { vehicleId: vehicle.id } });
    await prisma.vehicleInventoryItem.deleteMany({ where: { vehicleId: vehicle.id } });
    await prisma.inventoryTemplateItem.deleteMany({ where: { templateId: template.id } });
    await prisma.inventoryTemplate.delete({ where: { id: template.id } });
    await prisma.materialItem.delete({ where: { id: materialItem.id } });
    await prisma.vehicle.delete({ where: { id: vehicle.id } });
    await prisma.locality.delete({ where: { id: locality.id } });
    await prisma.municipality.deleteMany({ where: { district: `District ${RUN}` } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  });

  it('integration: submitting a report with lines drops stock, and the row starts flagged for recount', async () => {
    const report = await makeReport();
    createdReportIds.push(report.id);

    const lines: ConsumptionLineInput[] = [{ materialItemId: materialItem.id, vehicleId: vehicle.id, quantity: 3 }];
    await stockMovements.applyReportConsumption(report.id, lines, user.id);

    const row = await prisma.vehicleInventoryItem.findUnique({
      where: { vehicleId_templateItemId: { vehicleId: vehicle.id, templateItemId: templateItem.id } },
    });
    // Never counted before — created at 0 and flagged, then the deduction
    // floors it there too.
    expect(row).toMatchObject({ actualQuantity: 0, needsRecount: true });

    const movement = await prisma.stockMovement.findFirst({ where: { reportId: report.id } });
    expect(movement).toMatchObject({
      delta: -3,
      reason: StockMovementReason.CONSUMPTION,
      vehicleId: vehicle.id,
      materialItemId: materialItem.id,
    });
  });

  it('integration: a manual recount clears needsRecount and logs a MANUAL_ADJUSTMENT movement, then editing and re-submitting the report converges', async () => {
    const report = await makeReport();
    createdReportIds.push(report.id);

    // A coordinator counts the shelf and finds 10 — a fresh recount.
    await inventory.upsertVehicleInventoryItem(
      { vehicleId: vehicle.id, templateItemId: templateItem.id, actualQuantity: 10 },
      user.id,
    );
    const afterRecount = await prisma.vehicleInventoryItem.findUnique({
      where: { vehicleId_templateItemId: { vehicleId: vehicle.id, templateItemId: templateItem.id } },
    });
    expect(afterRecount).toMatchObject({ actualQuantity: 10, needsRecount: false });

    const manualAdjustment = await prisma.stockMovement.findFirst({
      where: { vehicleId: vehicle.id, materialItemId: materialItem.id, reason: StockMovementReason.MANUAL_ADJUSTMENT },
      orderBy: { occurredAt: 'desc' },
    });
    expect(manualAdjustment?.delta).toBe(10);

    // Submit with 2 units consumed.
    await stockMovements.applyReportConsumption(
      report.id,
      [{ materialItemId: materialItem.id, vehicleId: vehicle.id, quantity: 2 }],
      user.id,
    );
    let row = await prisma.vehicleInventoryItem.findUnique({
      where: { vehicleId_templateItemId: { vehicleId: vehicle.id, templateItemId: templateItem.id } },
    });
    expect(row).toMatchObject({ actualQuantity: 8 });

    // Edit the report to 5 units and re-submit — converges on 5 net
    // consumed from the recounted baseline, not 2+5.
    await stockMovements.applyReportConsumption(
      report.id,
      [{ materialItemId: materialItem.id, vehicleId: vehicle.id, quantity: 5 }],
      user.id,
    );
    row = await prisma.vehicleInventoryItem.findUnique({
      where: { vehicleId_templateItemId: { vehicleId: vehicle.id, templateItemId: templateItem.id } },
    });
    expect(row).toMatchObject({ actualQuantity: 5 });

    const consumptionMovements = await prisma.stockMovement.findMany({
      where: { reportId: report.id, reason: StockMovementReason.CONSUMPTION },
    });
    expect(consumptionMovements).toHaveLength(1);
    expect(consumptionMovements[0].delta).toBe(-5);
  });

  it('integration: deleting a report reverses its consumption and the FK survives the delete as SetNull', async () => {
    await inventory.upsertVehicleInventoryItem(
      { vehicleId: vehicle.id, templateItemId: templateItem.id, actualQuantity: 20 },
      user.id,
    );

    const report = await makeReport();
    await stockMovements.applyReportConsumption(
      report.id,
      [{ materialItemId: materialItem.id, vehicleId: vehicle.id, quantity: 6 }],
      user.id,
    );

    let row = await prisma.vehicleInventoryItem.findUnique({
      where: { vehicleId_templateItemId: { vehicleId: vehicle.id, templateItemId: templateItem.id } },
    });
    expect(row).toMatchObject({ actualQuantity: 14 });

    const movementBeforeDelete = await prisma.stockMovement.findFirst({ where: { reportId: report.id } });
    expect(movementBeforeDelete).not.toBeNull();

    // Mirrors what EventReportsService.remove() will do once #204 wires it in.
    await stockMovements.reverseReportConsumption(report.id);
    await prisma.eventReport.delete({ where: { id: report.id } });

    row = await prisma.vehicleInventoryItem.findUnique({
      where: { vehicleId_templateItemId: { vehicleId: vehicle.id, templateItemId: templateItem.id } },
    });
    expect(row).toMatchObject({ actualQuantity: 20 });

    // The report is gone, so `reportId` can no longer be the join key —
    // this asserts on the FK's `SetNull` instead: no row keeps pointing at
    // a report that no longer exists.
    const orphaned = await prisma.stockMovement.findMany({ where: { reportId: report.id } });
    expect(orphaned).toHaveLength(0);
  });

  it('integration: UNLIMITED items never touch VehicleInventoryItem or the movement ledger', async () => {
    const unlimitedItem = await prisma.materialItem.create({
      data: { namePt: `Sacos de Lixo ${RUN}`, type: InventoryItemType.UNLIMITED },
    });
    const unlimitedTemplateItem = await prisma.inventoryTemplateItem.create({
      data: {
        templateId: template.id,
        materialItemId: unlimitedItem.id,
        name: `Sacos de Lixo ${RUN}`,
        type: InventoryItemType.UNLIMITED,
      },
    });

    const report = await makeReport();
    createdReportIds.push(report.id);

    await stockMovements.applyReportConsumption(
      report.id,
      [{ materialItemId: unlimitedItem.id, vehicleId: vehicle.id, quantity: 500 }],
      user.id,
    );

    const row = await prisma.vehicleInventoryItem.findUnique({
      where: { vehicleId_templateItemId: { vehicleId: vehicle.id, templateItemId: unlimitedTemplateItem.id } },
    });
    expect(row).toBeNull();

    const movement = await prisma.stockMovement.findFirst({ where: { materialItemId: unlimitedItem.id } });
    expect(movement).toBeNull();

    await prisma.inventoryTemplateItem.delete({ where: { id: unlimitedTemplateItem.id } });
    await prisma.materialItem.delete({ where: { id: unlimitedItem.id } });
  });
});
