import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInventoryTemplateDto } from './dto/create-inventory-template.dto';
import { UpdateInventoryTemplateDto } from './dto/update-inventory-template.dto';
import { CreateInventoryTemplateItemDto } from './dto/create-inventory-template-item.dto';
import { UpdateInventoryTemplateItemDto } from './dto/update-inventory-template-item.dto';
import {
  UpsertVehicleInventoryItemDto,
  UpdateVehicleInventoryItemDto,
} from './dto/vehicle-inventory-item.dto';
import { VehicleType, InventoryItemType } from '@redinfo/shared';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Templates ────────────────────────────────────────────────────────────────

  async findAllTemplates(vehicleType?: VehicleType) {
    const where = vehicleType ? { vehicleType } : {};
    const templates = await this.prisma.inventoryTemplate.findMany({
      where,
      include: {
        items: {
          where: { isDeleted: false },
          orderBy: [{ order: 'asc' }, { name: 'asc' }],
        },
      },
      orderBy: { vehicleType: 'asc' },
    });
    return { data: templates, total: templates.length };
  }

  async findOneTemplate(id: string) {
    const template = await this.prisma.inventoryTemplate.findUnique({
      where: { id },
      include: {
        items: {
          where: { isDeleted: false },
          orderBy: [{ order: 'asc' }, { name: 'asc' }],
        },
      },
    });
    if (!template) throw new NotFoundException(`Inventory template ${id} not found`);
    return template;
  }

  async findTemplateByVehicleType(vehicleType: VehicleType) {
    const template = await this.prisma.inventoryTemplate.findUnique({
      where: { vehicleType },
      include: {
        items: {
          where: { isDeleted: false },
          orderBy: [{ order: 'asc' }, { name: 'asc' }],
        },
      },
    });
    if (!template) throw new NotFoundException(`Inventory template for ${vehicleType} not found`);
    return template;
  }

  async createTemplate(dto: CreateInventoryTemplateDto) {
    const existing = await this.prisma.inventoryTemplate.findUnique({
      where: { vehicleType: dto.vehicleType },
    });
    if (existing) {
      throw new ConflictException(
        `An inventory template for vehicle type ${dto.vehicleType} already exists`,
      );
    }
    return this.prisma.inventoryTemplate.create({
      data: {
        vehicleType: dto.vehicleType,
        notes: dto.notes ?? null,
      },
      include: {
        items: { where: { isDeleted: false } },
      },
    });
  }

  async updateTemplate(id: string, dto: UpdateInventoryTemplateDto) {
    await this.findOneTemplate(id);
    return this.prisma.inventoryTemplate.update({
      where: { id },
      data: {
        ...(dto.notes !== undefined && { notes: dto.notes }),
        version: { increment: 1 },
      },
      include: {
        items: {
          where: { isDeleted: false },
          orderBy: [{ order: 'asc' }, { name: 'asc' }],
        },
      },
    });
  }

  async removeTemplate(id: string) {
    await this.findOneTemplate(id);
    return this.prisma.inventoryTemplate.delete({ where: { id } });
  }

  // ─── Template Items ───────────────────────────────────────────────────────────

  async findAllTemplateItems(templateId?: string, page = 1, perPage = 100) {
    const skip = (page - 1) * perPage;
    const where = {
      isDeleted: false,
      ...(templateId ? { templateId } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.inventoryTemplateItem.findMany({
        where,
        skip,
        take: perPage,
        orderBy: [{ order: 'asc' }, { name: 'asc' }],
        include: { template: true },
      }),
      this.prisma.inventoryTemplateItem.count({ where }),
    ]);
    return { data, total, page, perPage };
  }

  async findOneTemplateItem(id: string) {
    const item = await this.prisma.inventoryTemplateItem.findFirst({
      where: { id, isDeleted: false },
      include: { template: true },
    });
    if (!item) throw new NotFoundException(`Inventory template item ${id} not found`);
    return item;
  }

  async createTemplateItem(dto: CreateInventoryTemplateItemDto) {
    const template = await this.findOneTemplate(dto.templateId);

    if (dto.type === InventoryItemType.COUNTABLE && dto.recommendedQuantity === undefined) {
      throw new BadRequestException(
        'recommendedQuantity is required for COUNTABLE items',
      );
    }

    const item = await this.prisma.inventoryTemplateItem.create({
      data: {
        templateId: dto.templateId,
        name: dto.name,
        type: dto.type,
        recommendedQuantity: dto.type === InventoryItemType.UNLIMITED ? null : (dto.recommendedQuantity ?? 0),
        unit: dto.unit ?? 'pcs',
        notes: dto.notes ?? null,
        order: dto.order ?? 0,
      },
      include: { template: true },
    });

    // Bump template version when items change
    await this.prisma.inventoryTemplate.update({
      where: { id: template.id },
      data: { version: { increment: 1 } },
    });

    return item;
  }

  async updateTemplateItem(id: string, dto: UpdateInventoryTemplateItemDto) {
    const item = await this.findOneTemplateItem(id);

    const updatedItem = await this.prisma.inventoryTemplateItem.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.recommendedQuantity !== undefined && {
          recommendedQuantity:
            (dto.type ?? item.type) === InventoryItemType.UNLIMITED
              ? null
              : dto.recommendedQuantity,
        }),
        ...(dto.unit !== undefined && { unit: dto.unit }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.order !== undefined && { order: dto.order }),
      },
      include: { template: true },
    });

    // Bump template version when items change
    await this.prisma.inventoryTemplate.update({
      where: { id: item.templateId },
      data: { version: { increment: 1 } },
    });

    return updatedItem;
  }

  async removeTemplateItem(id: string) {
    const item = await this.findOneTemplateItem(id);

    const deletedItem = await this.prisma.inventoryTemplateItem.update({
      where: { id },
      data: { isDeleted: true },
    });

    // Bump template version
    await this.prisma.inventoryTemplate.update({
      where: { id: item.templateId },
      data: { version: { increment: 1 } },
    });

    return deletedItem;
  }

  // ─── Vehicle Inventory ────────────────────────────────────────────────────────

  async getVehicleInventory(vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, isDeleted: false },
    });
    if (!vehicle) throw new NotFoundException(`Vehicle ${vehicleId} not found`);

    const template = await this.prisma.inventoryTemplate.findUnique({
      where: { vehicleType: vehicle.vehicleType },
      include: {
        items: {
          where: { isDeleted: false },
          orderBy: [{ order: 'asc' }, { name: 'asc' }],
        },
      },
    });

    const vehicleInventoryItems = await this.prisma.vehicleInventoryItem.findMany({
      where: { vehicleId },
      include: { templateItem: true },
    });

    const inventoryMap = new Map(
      vehicleInventoryItems.map((item) => [item.templateItemId, item]),
    );

    const rows = template
      ? template.items.map((templateItem) => {
          const vehicleInventoryItem = inventoryMap.get(templateItem.id);
          const actual = vehicleInventoryItem?.actualQuantity ?? null;
          const recommended = templateItem.recommendedQuantity;

          let status: 'low' | 'ok' | 'over' | 'unlimited';
          if (templateItem.type === InventoryItemType.UNLIMITED) {
            status = 'unlimited';
          } else if (actual === null || actual === undefined) {
            status = recommended !== null && recommended !== undefined && recommended > 0 ? 'low' : 'ok';
          } else if (actual < (recommended ?? 0)) {
            status = 'low';
          } else if (actual > (recommended ?? 0)) {
            status = 'over';
          } else {
            status = 'ok';
          }

          return {
            templateItem,
            vehicleInventoryItem: vehicleInventoryItem ?? null,
            status,
          };
        })
      : [];

    return {
      vehicleId,
      vehicleType: vehicle.vehicleType,
      template: template ?? null,
      rows,
      hasLowStock: rows.some((r) => r.status === 'low'),
    };
  }

  async findAllVehicleInventoryItems(vehicleId?: string, page = 1, perPage = 100) {
    const skip = (page - 1) * perPage;
    const where = vehicleId ? { vehicleId } : {};
    const [data, total] = await this.prisma.$transaction([
      this.prisma.vehicleInventoryItem.findMany({
        where,
        skip,
        take: perPage,
        include: { templateItem: { include: { template: true } } },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.vehicleInventoryItem.count({ where }),
    ]);
    return { data, total, page, perPage };
  }

  async findOneVehicleInventoryItem(id: string) {
    const item = await this.prisma.vehicleInventoryItem.findUnique({
      where: { id },
      include: {
        templateItem: { include: { template: true } },
        audits: { orderBy: { changedAt: 'desc' }, take: 20 },
      },
    });
    if (!item) throw new NotFoundException(`Vehicle inventory item ${id} not found`);
    return item;
  }

  async upsertVehicleInventoryItem(dto: UpsertVehicleInventoryItemDto, userId?: string) {
    const templateItem = await this.findOneTemplateItem(dto.templateItemId);

    if (templateItem.type === InventoryItemType.COUNTABLE) {
      if (dto.actualQuantity === undefined || dto.actualQuantity === null) {
        throw new BadRequestException('actualQuantity is required for COUNTABLE items');
      }
      if (!Number.isInteger(dto.actualQuantity)) {
        throw new BadRequestException('actualQuantity must be an integer for COUNTABLE items');
      }
    }

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: dto.vehicleId, isDeleted: false },
    });
    if (!vehicle) throw new NotFoundException(`Vehicle ${dto.vehicleId} not found`);

    const template = await this.prisma.inventoryTemplate.findUnique({
      where: { vehicleType: vehicle.vehicleType },
    });

    const existing = await this.prisma.vehicleInventoryItem.findUnique({
      where: { vehicleId_templateItemId: { vehicleId: dto.vehicleId, templateItemId: dto.templateItemId } },
    });

    if (existing) {
      const updated = await this.prisma.vehicleInventoryItem.update({
        where: { id: existing.id },
        data: {
          actualQuantity: dto.actualQuantity ?? null,
          templateVersion: template?.version ?? 1,
          updatedById: userId ?? null,
        },
        include: { templateItem: true },
      });

      await this.prisma.vehicleInventoryAudit.create({
        data: {
          vehicleInventoryItemId: existing.id,
          changedById: userId ?? null,
          oldQuantity: existing.actualQuantity,
          newQuantity: dto.actualQuantity ?? null,
        },
      });

      return updated;
    }

    return this.prisma.vehicleInventoryItem.create({
      data: {
        vehicleId: dto.vehicleId,
        templateItemId: dto.templateItemId,
        actualQuantity: dto.actualQuantity ?? null,
        templateVersion: template?.version ?? 1,
        updatedById: userId ?? null,
      },
      include: { templateItem: true },
    });
  }

  async updateVehicleInventoryItem(id: string, dto: UpdateVehicleInventoryItemDto, userId?: string) {
    const existing = await this.findOneVehicleInventoryItem(id);

    const templateItem = existing.templateItem;
    if (templateItem.type === InventoryItemType.COUNTABLE) {
      if (dto.actualQuantity !== undefined && dto.actualQuantity !== null) {
        if (!Number.isInteger(dto.actualQuantity)) {
          throw new BadRequestException('actualQuantity must be an integer for COUNTABLE items');
        }
      }
    }

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: existing.vehicleId, isDeleted: false },
    });
    const template = vehicle
      ? await this.prisma.inventoryTemplate.findUnique({
          where: { vehicleType: vehicle.vehicleType },
        })
      : null;

    const updated = await this.prisma.vehicleInventoryItem.update({
      where: { id },
      data: {
        actualQuantity: dto.actualQuantity ?? null,
        templateVersion: template?.version ?? existing.templateVersion,
        updatedById: userId ?? null,
      },
      include: { templateItem: true },
    });

    await this.prisma.vehicleInventoryAudit.create({
      data: {
        vehicleInventoryItemId: id,
        changedById: userId ?? null,
        oldQuantity: existing.actualQuantity,
        newQuantity: dto.actualQuantity ?? null,
      },
    });

    return updated;
  }

  async removeVehicleInventoryItem(id: string) {
    await this.findOneVehicleInventoryItem(id);
    return this.prisma.vehicleInventoryItem.delete({ where: { id } });
  }

  // ─── Low Stock ────────────────────────────────────────────────────────────────

  async findLowStockVehicles(vehicleType?: VehicleType) {
    const vehicleWhere = {
      isDeleted: false,
      ...(vehicleType ? { vehicleType } : {}),
    };

    const vehicles = await this.prisma.vehicle.findMany({
      where: vehicleWhere,
      include: {
        vehicleInventoryItems: {
          include: { templateItem: true },
        },
      },
      orderBy: { vehicleType: 'asc' },
    });

    // Get all templates for type lookup
    const templates = await this.prisma.inventoryTemplate.findMany({
      include: {
        items: { where: { isDeleted: false } },
      },
    });
    const templateByType = new Map(templates.map((t) => [t.vehicleType, t]));

    const result = vehicles.map((vehicle) => {
      const template = templateByType.get(vehicle.vehicleType);
      if (!template) {
        return { vehicle, hasLowStock: false, lowStockItems: [] };
      }

      const inventoryMap = new Map(
        vehicle.vehicleInventoryItems.map((i) => [i.templateItemId, i]),
      );

      const lowStockItems = template.items
        .filter((templateItem) => {
          if (templateItem.type === InventoryItemType.UNLIMITED) return false;
          const vehicleItem = inventoryMap.get(templateItem.id);
          const actual = vehicleItem?.actualQuantity ?? null;
          const recommended = templateItem.recommendedQuantity ?? 0;
          return actual === null || actual < recommended;
        })
        .map((templateItem) => ({
          templateItem,
          vehicleInventoryItem: inventoryMap.get(templateItem.id) ?? null,
        }));

      return {
        vehicle,
        hasLowStock: lowStockItems.length > 0,
        lowStockItems,
      };
    });

    const lowStockVehicles = result.filter((r) => r.hasLowStock);

    // Group by vehicle type
    const grouped = lowStockVehicles.reduce(
      (acc, item) => {
        const type = item.vehicle.vehicleType;
        if (!acc[type]) acc[type] = [];
        acc[type].push(item);
        return acc;
      },
      {} as Record<string, typeof lowStockVehicles>,
    );

    return { grouped, total: lowStockVehicles.length };
  }

  // ─── CSV Export / Import ──────────────────────────────────────────────────────

  async exportTemplateCsv(templateId: string): Promise<string> {
    const template = await this.findOneTemplate(templateId);
    const headers = ['name', 'type', 'recommendedQuantity', 'unit', 'notes', 'order'];
    const rows = template.items.map((item) =>
      [
        this.csvEscape(item.name),
        item.type,
        item.recommendedQuantity ?? '',
        this.csvEscape(item.unit),
        this.csvEscape(item.notes ?? ''),
        item.order,
      ].join(','),
    );
    return [headers.join(','), ...rows].join('\n');
  }

  async importTemplateCsv(templateId: string, csvContent: string): Promise<{ created: number; updated: number }> {
    const template = await this.findOneTemplate(templateId);
    const lines = csvContent.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) return { created: 0, updated: 0 };

    const [headerLine, ...dataLines] = lines;
    const headers = headerLine.split(',').map((h) => h.trim());

    let created = 0;
    let updated = 0;

    for (const line of dataLines) {
      const values = this.parseCsvLine(line);
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = values[i] ?? ''; });

      const name = row['name']?.trim();
      if (!name) continue;

      const type =
        row['type']?.toUpperCase() === 'UNLIMITED'
          ? InventoryItemType.UNLIMITED
          : InventoryItemType.COUNTABLE;
      const recommendedQuantity =
        type === InventoryItemType.UNLIMITED
          ? null
          : row['recommendedQuantity']
          ? parseInt(row['recommendedQuantity'], 10)
          : 0;
      const unit = row['unit']?.trim() || 'pcs';
      const notes = row['notes']?.trim() || null;
      const order = row['order'] ? parseInt(row['order'], 10) : 0;

      const existing = template.items.find(
        (i) => i.name.toLowerCase() === name.toLowerCase(),
      );

      if (existing) {
        await this.prisma.inventoryTemplateItem.update({
          where: { id: existing.id },
          data: { type, recommendedQuantity, unit, notes, order },
        });
        updated++;
      } else {
        await this.prisma.inventoryTemplateItem.create({
          data: {
            templateId,
            name,
            type,
            recommendedQuantity,
            unit,
            notes,
            order,
          },
        });
        created++;
      }
    }

    // Bump template version
    await this.prisma.inventoryTemplate.update({
      where: { id: templateId },
      data: { version: { increment: 1 } },
    });

    return { created, updated };
  }

  async exportVehicleInventoryCsv(vehicleId: string): Promise<string> {
    const inventory = await this.getVehicleInventory(vehicleId);
    const headers = ['itemName', 'type', 'recommendedQuantity', 'unit', 'actualQuantity', 'status'];
    const rows = inventory.rows.map((row) =>
      [
        this.csvEscape(row.templateItem.name),
        row.templateItem.type,
        row.templateItem.recommendedQuantity ?? '',
        this.csvEscape(row.templateItem.unit),
        row.vehicleInventoryItem?.actualQuantity ?? '',
        row.status,
      ].join(','),
    );
    return [headers.join(','), ...rows].join('\n');
  }

  async importVehicleInventoryCsv(
    vehicleId: string,
    csvContent: string,
    userId?: string,
  ): Promise<{ updated: number }> {
    const inventory = await this.getVehicleInventory(vehicleId);
    if (!inventory.template) {
      throw new NotFoundException(`No inventory template found for this vehicle type`);
    }

    const lines = csvContent.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) return { updated: 0 };

    const [headerLine, ...dataLines] = lines;
    const headers = headerLine.split(',').map((h) => h.trim());

    let updated = 0;

    for (const line of dataLines) {
      const values = this.parseCsvLine(line);
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = values[i] ?? ''; });

      const itemName = row['itemName']?.trim();
      const actualStr = row['actualQuantity']?.trim();
      if (!itemName || actualStr === undefined) continue;

      const templateItem = inventory.template!.items.find(
        (i) => i.name.toLowerCase() === itemName.toLowerCase(),
      );
      if (!templateItem) continue;

      const actualQuantity = actualStr === '' ? null : parseInt(actualStr, 10);

      await this.upsertVehicleInventoryItem(
        { vehicleId, templateItemId: templateItem.id, actualQuantity: actualQuantity ?? undefined },
        userId,
      );
      updated++;
    }

    return { updated };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private csvEscape(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  }
}
