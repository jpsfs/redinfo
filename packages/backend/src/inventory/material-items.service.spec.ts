import { NotFoundException } from '@nestjs/common';
import { ApiConflictException } from '../common/api-error.exception';
import { MaterialItemsService } from './material-items.service';
import { InventoryItemType } from '@redinfo/shared';

// ── helpers ────────────────────────────────────────────────────────────────────

const GLOVES = {
  id: 'mi-1',
  namePt: 'Luvas',
  nameEn: 'Gloves',
  unit: 'box',
  type: InventoryItemType.COUNTABLE,
  notes: null,
  isFrequent: true,
  frequentOrder: 1,
  isDeleted: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  barcodes: [{ id: 'bc-1', materialItemId: 'mi-1', code: '5601234567890', label: null }],
};

function buildPrismaStub(overrides: Record<string, unknown> = {}) {
  const stub = {
    materialItem: {
      findMany: jest.fn().mockResolvedValue([GLOVES]),
      findFirst: jest.fn().mockResolvedValue(GLOVES),
      count: jest.fn().mockResolvedValue(1),
      create: jest.fn().mockImplementation((args) =>
        Promise.resolve({ id: 'mi-new', barcodes: [], ...args.data }),
      ),
      update: jest.fn().mockImplementation((args) =>
        Promise.resolve({ ...GLOVES, id: args.where.id, ...args.data }),
      ),
    },
    materialItemBarcode: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: jest.fn(),
    ...overrides,
  };
  stub.$transaction.mockImplementation((arg: unknown) => {
    if (typeof arg === 'function') return (arg as (tx: unknown) => unknown)(stub);
    return Promise.all(arg as unknown[]);
  });
  return stub;
}

// ── MaterialItemsService unit tests ─────────────────────────────────────────────

describe('MaterialItemsService', () => {
  let service: MaterialItemsService;
  let prisma: ReturnType<typeof buildPrismaStub>;

  beforeEach(() => {
    prisma = buildPrismaStub();
    service = new MaterialItemsService(prisma as never);
  });

  describe('findAll', () => {
    it('matches namePt, nameEn or a barcode case-insensitively via q', async () => {
      await service.findAll({ q: 'glo' });
      const where = prisma.materialItem.findMany.mock.calls[0][0].where;
      expect(where.OR).toEqual([
        { namePt: { contains: 'glo', mode: 'insensitive' } },
        { nameEn: { contains: 'glo', mode: 'insensitive' } },
        { barcodes: { some: { code: { contains: 'glo', mode: 'insensitive' } } } },
      ]);
    });

    it('orders frequent-only results by frequentOrder then namePt', async () => {
      await service.findAll({ frequent: true });
      const call = prisma.materialItem.findMany.mock.calls[0][0];
      expect(call.where).toMatchObject({ isFrequent: true });
      expect(call.orderBy).toEqual([{ frequentOrder: 'asc' }, { namePt: 'asc' }]);
    });

    it('orders the unfiltered list by namePt', async () => {
      await service.findAll({});
      const call = prisma.materialItem.findMany.mock.calls[0][0];
      expect(call.orderBy).toEqual([{ namePt: 'asc' }]);
    });

    it('excludes soft-deleted items by default', async () => {
      await service.findAll({});
      const where = prisma.materialItem.findMany.mock.calls[0][0].where;
      expect(where.isDeleted).toBe(false);
    });
  });

  describe('findByBarcode', () => {
    it('returns the owning item for a known code', async () => {
      prisma.materialItemBarcode.findUnique.mockResolvedValue({
        id: 'bc-1',
        code: '5601234567890',
        materialItem: GLOVES,
      });
      const result = await service.findByBarcode('5601234567890');
      expect(result).toMatchObject({ id: 'mi-1' });
    });

    it('404s for an unknown code', async () => {
      prisma.materialItemBarcode.findUnique.mockResolvedValue(null);
      await expect(service.findByBarcode('nope')).rejects.toThrow(NotFoundException);
    });

    it('404s when the owning item has been soft-deleted', async () => {
      prisma.materialItemBarcode.findUnique.mockResolvedValue({
        id: 'bc-1',
        code: '5601234567890',
        materialItem: { ...GLOVES, isDeleted: true },
      });
      await expect(service.findByBarcode('5601234567890')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('creates an item with its barcode set', async () => {
      await service.create({
        namePt: 'Compressas',
        type: InventoryItemType.COUNTABLE,
        barcodes: [{ code: '5609876543210' }],
      });
      expect(prisma.materialItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            namePt: 'Compressas',
            barcodes: { create: [{ code: '5609876543210', label: null }] },
          }),
        }),
      );
    });

    it('rejects a barcode already used by another item', async () => {
      prisma.materialItemBarcode.findFirst.mockResolvedValue({
        code: '5601234567890',
        materialItem: GLOVES,
      });
      await expect(
        service.create({
          namePt: 'Compressas',
          type: InventoryItemType.COUNTABLE,
          barcodes: [{ code: '5601234567890' }],
        }),
      ).rejects.toThrow(ApiConflictException);
    });

    it('rejects the same code listed twice on the same item', async () => {
      await expect(
        service.create({
          namePt: 'Compressas',
          type: InventoryItemType.COUNTABLE,
          barcodes: [{ code: 'A1' }, { code: 'A1' }],
        }),
      ).rejects.toThrow(ApiConflictException);
    });
  });

  describe('update', () => {
    it('replaces barcodes wholesale when barcodes is provided', async () => {
      await service.update('mi-1', { barcodes: [{ code: 'NEW-CODE' }] });
      expect(prisma.materialItemBarcode.deleteMany).toHaveBeenCalledWith({
        where: { materialItemId: 'mi-1' },
      });
      expect(prisma.materialItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ barcodes: { create: [{ code: 'NEW-CODE', label: null }] } }),
        }),
      );
    });

    it('leaves barcodes untouched when barcodes is omitted', async () => {
      await service.update('mi-1', { namePt: 'Luvas (nitrilo)' });
      expect(prisma.materialItemBarcode.deleteMany).not.toHaveBeenCalled();
      expect(prisma.materialItem.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.not.objectContaining({ barcodes: expect.anything() }) }),
      );
    });

    it('404s for a missing item', async () => {
      prisma.materialItem.findFirst.mockResolvedValue(null);
      await expect(service.update('missing', { namePt: 'x' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('soft-deletes rather than hard-deleting', async () => {
      await service.remove('mi-1');
      expect(prisma.materialItem.update).toHaveBeenCalledWith({
        where: { id: 'mi-1' },
        data: { isDeleted: true },
      });
    });
  });
});
