import { PrismaClient } from '@prisma/client';
import { InventoryItemType } from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { MaterialItemsService } from './material-items.service';

/**
 * Integration coverage for #202's catalogue module against a real Postgres —
 * the unit spec (`material-items.service.spec.ts`) covers the same behaviour
 * against a mocked Prisma; this proves the unique-barcode constraint and the
 * case-insensitive search actually work at the database.
 *
 * Skipped unless DATABASE_URL is set, and named so
 * `pnpm --filter backend test:integration` selects it.
 */
const describeIntegration = process.env.DATABASE_URL ? describe : describe.skip;

const RUN = `it-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const barcode = (suffix: string) => `${RUN}-${suffix}`;

describeIntegration('MaterialItemsService (integration)', () => {
  const prisma = new PrismaClient() as unknown as PrismaService;
  const service = new MaterialItemsService(prisma);
  const createdIds: string[] = [];

  afterAll(async () => {
    await prisma.materialItemBarcode.deleteMany({ where: { materialItemId: { in: createdIds } } });
    await prisma.materialItem.deleteMany({ where: { id: { in: createdIds } } });
  });

  it('integration: finds an item by its barcode', async () => {
    const item = await service.create({
      namePt: `Luvas ${RUN}`,
      nameEn: 'Gloves',
      type: InventoryItemType.COUNTABLE,
      barcodes: [{ code: barcode('gloves') }],
    });
    createdIds.push(item.id);

    const found = await service.findByBarcode(barcode('gloves'));
    expect(found.id).toBe(item.id);
  });

  it('integration: 404s a barcode that belongs to a soft-deleted item', async () => {
    const item = await service.create({
      namePt: `Compressas ${RUN}`,
      type: InventoryItemType.COUNTABLE,
      barcodes: [{ code: barcode('gauze') }],
    });
    createdIds.push(item.id);
    await service.remove(item.id);

    await expect(service.findByBarcode(barcode('gauze'))).rejects.toThrow('No material item for barcode');
  });

  it('integration: rejects a barcode already used by another item with MATERIAL_ITEM_BARCODE_CONFLICT', async () => {
    const first = await service.create({
      namePt: `Soro ${RUN}`,
      type: InventoryItemType.COUNTABLE,
      barcodes: [{ code: barcode('saline') }],
    });
    createdIds.push(first.id);

    await expect(
      service.create({
        namePt: `Soro (outra marca) ${RUN}`,
        type: InventoryItemType.COUNTABLE,
        barcodes: [{ code: barcode('saline') }],
      }),
    ).rejects.toMatchObject({ code: 'MATERIAL_ITEM_BARCODE_CONFLICT' });
  });

  it('integration: q matches namePt and nameEn case-insensitively', async () => {
    const item = await service.create({
      namePt: `Máscara O2 ${RUN}`,
      nameEn: `Oxygen Mask ${RUN}`,
      type: InventoryItemType.COUNTABLE,
    });
    createdIds.push(item.id);

    const byPt = await service.findAll({ q: `máscara o2 ${RUN}`.toUpperCase() });
    expect(byPt.data.map((i) => i.id)).toContain(item.id);

    const byEn = await service.findAll({ q: `oxygen mask ${RUN}` });
    expect(byEn.data.map((i) => i.id)).toContain(item.id);
  });
});
