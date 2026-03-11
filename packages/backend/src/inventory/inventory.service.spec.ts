import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { VehicleType, InventoryItemType } from '@redinfo/shared';

// ── helpers ────────────────────────────────────────────────────────────────────

const EMERGENCY_TEMPLATE = {
  id: 'tpl-1',
  vehicleType: VehicleType.EMERGENCY,
  version: 1,
  notes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  items: [
    {
      id: 'item-1',
      templateId: 'tpl-1',
      name: 'First Aid Kit',
      type: InventoryItemType.COUNTABLE,
      recommendedQuantity: 2,
      unit: 'kit',
      notes: null,
      order: 1,
      isDeleted: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'item-2',
      templateId: 'tpl-1',
      name: 'Medical Waste Bag',
      type: InventoryItemType.UNLIMITED,
      recommendedQuantity: null,
      unit: 'pcs',
      notes: null,
      order: 2,
      isDeleted: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ],
};

const EMERGENCY_VEHICLE = {
  id: 'v1',
  vehicleType: VehicleType.EMERGENCY,
  isDeleted: false,
  licensePlate: '55-AA-12',
  numeroCauda: 'VIAT-01',
};

function buildPrismaStub(overrides: Record<string, unknown> = {}) {
  return {
    inventoryTemplate: {
      findMany: jest.fn().mockResolvedValue([EMERGENCY_TEMPLATE]),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((args) =>
        Promise.resolve({ id: 'tpl-new', ...args.data, items: [] }),
      ),
      update: jest.fn().mockImplementation((args) =>
        Promise.resolve({ id: args.where.id, ...args.data }),
      ),
      delete: jest.fn().mockResolvedValue({ id: 'tpl-1' }),
    },
    inventoryTemplateItem: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((args) =>
        Promise.resolve({ id: 'item-new', ...args.data }),
      ),
      update: jest.fn().mockImplementation((args) =>
        Promise.resolve({ id: args.where.id, ...args.data }),
      ),
      count: jest.fn().mockResolvedValue(0),
    },
    vehicleInventoryItem: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((args) =>
        Promise.resolve({ id: 'vi-1', ...args.data }),
      ),
      update: jest.fn().mockImplementation((args) =>
        Promise.resolve({ id: args.where.id, ...args.data }),
      ),
      delete: jest.fn().mockResolvedValue({ id: 'vi-1' }),
      count: jest.fn().mockResolvedValue(0),
    },
    vehicleInventoryAudit: {
      create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
    },
    vehicle: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn().mockImplementation((ops: unknown[]) => Promise.all(ops)),
    ...overrides,
  };
}

// ── InventoryService unit tests ────────────────────────────────────────────────

describe('InventoryService', () => {
  let service: InventoryService;
  let prisma: ReturnType<typeof buildPrismaStub>;

  beforeEach(() => {
    prisma = buildPrismaStub();
    service = new InventoryService(prisma as never);
  });

  // ── templates ────────────────────────────────────────────────────────────────

  describe('createTemplate', () => {
    it('creates a template for a new vehicle type', async () => {
      prisma.inventoryTemplate.findUnique.mockResolvedValue(null);
      const dto = { vehicleType: VehicleType.TRANSPORT };
      await service.createTemplate(dto);
      expect(prisma.inventoryTemplate.create).toHaveBeenCalledTimes(1);
    });

    it('throws ConflictException when template already exists for vehicle type', async () => {
      prisma.inventoryTemplate.findUnique.mockResolvedValue(EMERGENCY_TEMPLATE);
      await expect(
        service.createTemplate({ vehicleType: VehicleType.EMERGENCY }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findOneTemplate', () => {
    it('returns a template when found', async () => {
      prisma.inventoryTemplate.findUnique.mockResolvedValue(EMERGENCY_TEMPLATE);
      const result = await service.findOneTemplate('tpl-1');
      expect(result).toMatchObject({ id: 'tpl-1' });
    });

    it('throws NotFoundException when template does not exist', async () => {
      prisma.inventoryTemplate.findUnique.mockResolvedValue(null);
      await expect(service.findOneTemplate('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateTemplate', () => {
    it('updates template and increments version', async () => {
      prisma.inventoryTemplate.findUnique.mockResolvedValue(EMERGENCY_TEMPLATE);
      await service.updateTemplate('tpl-1', { notes: 'Updated notes' });
      expect(prisma.inventoryTemplate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ version: { increment: 1 } }),
        }),
      );
    });
  });

  // ── template items ────────────────────────────────────────────────────────────

  describe('createTemplateItem', () => {
    it('creates a countable item with recommendedQuantity', async () => {
      prisma.inventoryTemplate.findUnique.mockResolvedValue(EMERGENCY_TEMPLATE);
      const dto = {
        templateId: 'tpl-1',
        name: 'Oxygen Cylinder',
        type: InventoryItemType.COUNTABLE,
        recommendedQuantity: 2,
        unit: 'pcs',
      };
      await service.createTemplateItem(dto);
      expect(prisma.inventoryTemplateItem.create).toHaveBeenCalledTimes(1);
    });

    it('creates an UNLIMITED item with null recommendedQuantity', async () => {
      prisma.inventoryTemplate.findUnique.mockResolvedValue(EMERGENCY_TEMPLATE);
      const dto = {
        templateId: 'tpl-1',
        name: 'Waste Bags',
        type: InventoryItemType.UNLIMITED,
        unit: 'pcs',
      };
      await service.createTemplateItem(dto);
      const callData = prisma.inventoryTemplateItem.create.mock.calls[0][0].data;
      expect(callData.recommendedQuantity).toBeNull();
    });

    it('throws BadRequestException for COUNTABLE item without recommendedQuantity', async () => {
      prisma.inventoryTemplate.findUnique.mockResolvedValue(EMERGENCY_TEMPLATE);
      const dto = {
        templateId: 'tpl-1',
        name: 'Missing Qty Item',
        type: InventoryItemType.COUNTABLE,
        unit: 'pcs',
      };
      await expect(service.createTemplateItem(dto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('removeTemplateItem', () => {
    it('soft-deletes item by setting isDeleted=true', async () => {
      const item = { id: 'item-1', templateId: 'tpl-1', isDeleted: false, template: EMERGENCY_TEMPLATE };
      prisma.inventoryTemplateItem.findFirst.mockResolvedValue(item);
      await service.removeTemplateItem('item-1');
      expect(prisma.inventoryTemplateItem.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isDeleted: true } }),
      );
    });
  });

  // ── vehicle inventory ─────────────────────────────────────────────────────────

  describe('getVehicleInventory', () => {
    it('returns inventory rows with status for each template item', async () => {
      prisma.vehicle.findFirst.mockResolvedValue(EMERGENCY_VEHICLE);
      prisma.inventoryTemplate.findUnique.mockResolvedValue(EMERGENCY_TEMPLATE);
      prisma.vehicleInventoryItem.findMany.mockResolvedValue([
        {
          id: 'vi-1',
          vehicleId: 'v1',
          templateItemId: 'item-1',
          actualQuantity: 1,
          templateVersion: 1,
          templateItem: EMERGENCY_TEMPLATE.items[0],
        },
      ]);

      const result = await service.getVehicleInventory('v1');
      expect(result.rows).toHaveLength(2);
      const firstRow = result.rows.find((r) => r.templateItem.id === 'item-1');
      expect(firstRow?.status).toBe('low'); // 1 actual < 2 recommended
      const secondRow = result.rows.find((r) => r.templateItem.id === 'item-2');
      expect(secondRow?.status).toBe('unlimited');
    });

    it('marks row as ok when actual === recommended', async () => {
      prisma.vehicle.findFirst.mockResolvedValue(EMERGENCY_VEHICLE);
      prisma.inventoryTemplate.findUnique.mockResolvedValue(EMERGENCY_TEMPLATE);
      prisma.vehicleInventoryItem.findMany.mockResolvedValue([
        {
          id: 'vi-1',
          vehicleId: 'v1',
          templateItemId: 'item-1',
          actualQuantity: 2,
          templateVersion: 1,
          templateItem: EMERGENCY_TEMPLATE.items[0],
        },
      ]);

      const result = await service.getVehicleInventory('v1');
      const row = result.rows.find((r) => r.templateItem.id === 'item-1');
      expect(row?.status).toBe('ok');
    });

    it('marks row as over when actual > recommended', async () => {
      prisma.vehicle.findFirst.mockResolvedValue(EMERGENCY_VEHICLE);
      prisma.inventoryTemplate.findUnique.mockResolvedValue(EMERGENCY_TEMPLATE);
      prisma.vehicleInventoryItem.findMany.mockResolvedValue([
        {
          id: 'vi-1',
          vehicleId: 'v1',
          templateItemId: 'item-1',
          actualQuantity: 5,
          templateVersion: 1,
          templateItem: EMERGENCY_TEMPLATE.items[0],
        },
      ]);

      const result = await service.getVehicleInventory('v1');
      const row = result.rows.find((r) => r.templateItem.id === 'item-1');
      expect(row?.status).toBe('over');
    });

    it('throws NotFoundException when vehicle does not exist', async () => {
      prisma.vehicle.findFirst.mockResolvedValue(null);
      await expect(service.getVehicleInventory('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('upsertVehicleInventoryItem', () => {
    it('creates a new vehicle inventory item when it does not exist', async () => {
      const item = {
        ...EMERGENCY_TEMPLATE.items[0],
        template: EMERGENCY_TEMPLATE,
        isDeleted: false,
      };
      prisma.inventoryTemplateItem.findFirst.mockResolvedValue(item);
      prisma.vehicle.findFirst.mockResolvedValue(EMERGENCY_VEHICLE);
      prisma.inventoryTemplate.findUnique.mockResolvedValue(EMERGENCY_TEMPLATE);
      prisma.vehicleInventoryItem.findUnique.mockResolvedValue(null);

      await service.upsertVehicleInventoryItem(
        { vehicleId: 'v1', templateItemId: 'item-1', actualQuantity: 3 },
        'user-1',
      );
      expect(prisma.vehicleInventoryItem.create).toHaveBeenCalledTimes(1);
    });

    it('updates existing vehicle inventory item and creates audit entry', async () => {
      const item = {
        ...EMERGENCY_TEMPLATE.items[0],
        template: EMERGENCY_TEMPLATE,
        isDeleted: false,
      };
      prisma.inventoryTemplateItem.findFirst.mockResolvedValue(item);
      prisma.vehicle.findFirst.mockResolvedValue(EMERGENCY_VEHICLE);
      prisma.inventoryTemplate.findUnique.mockResolvedValue(EMERGENCY_TEMPLATE);
      prisma.vehicleInventoryItem.findUnique.mockResolvedValue({
        id: 'vi-1',
        vehicleId: 'v1',
        templateItemId: 'item-1',
        actualQuantity: 1,
        templateVersion: 1,
      });

      await service.upsertVehicleInventoryItem(
        { vehicleId: 'v1', templateItemId: 'item-1', actualQuantity: 3 },
        'user-1',
      );
      expect(prisma.vehicleInventoryItem.update).toHaveBeenCalledTimes(1);
      expect(prisma.vehicleInventoryAudit.create).toHaveBeenCalledTimes(1);
    });

    it('throws BadRequestException for non-integer actualQuantity on COUNTABLE item', async () => {
      const item = {
        ...EMERGENCY_TEMPLATE.items[0],
        template: EMERGENCY_TEMPLATE,
        isDeleted: false,
      };
      prisma.inventoryTemplateItem.findFirst.mockResolvedValue(item);

      await expect(
        service.upsertVehicleInventoryItem({
          vehicleId: 'v1',
          templateItemId: 'item-1',
          actualQuantity: 1.5 as unknown as number,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── low stock ─────────────────────────────────────────────────────────────────

  describe('findLowStockVehicles', () => {
    it('returns vehicles with low stock items grouped by type', async () => {
      prisma.vehicle.findMany.mockResolvedValue([
        {
          ...EMERGENCY_VEHICLE,
          vehicleInventoryItems: [
            {
              id: 'vi-1',
              vehicleId: 'v1',
              templateItemId: 'item-1',
              actualQuantity: 0,
              templateItem: EMERGENCY_TEMPLATE.items[0],
            },
          ],
        },
      ]);
      prisma.inventoryTemplate.findMany.mockResolvedValue([EMERGENCY_TEMPLATE]);

      const result = await service.findLowStockVehicles();
      expect(result.total).toBe(1);
      expect(result.grouped[VehicleType.EMERGENCY]).toHaveLength(1);
    });
  });

  // ── CSV export ────────────────────────────────────────────────────────────────

  describe('exportTemplateCsv', () => {
    it('returns CSV with header and one row per item', async () => {
      prisma.inventoryTemplate.findUnique.mockResolvedValue(EMERGENCY_TEMPLATE);
      const csv = await service.exportTemplateCsv('tpl-1');
      const lines = csv.split('\n');
      expect(lines[0]).toContain('name');
      expect(lines[0]).toContain('type');
      expect(lines.length).toBe(EMERGENCY_TEMPLATE.items.length + 1);
    });
  });
});
