import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ApiConflictException } from '../common/api-error.exception';
import { CreateMaterialItemDto, UpdateMaterialItemDto, MaterialItemBarcodeDto } from './dto/material-item.dto';
import { InventoryItemType } from '@redinfo/shared';

export interface MaterialItemFilters {
  /** Matches namePt, nameEn or a barcode — case-insensitive. */
  q?: string;
  /** When true, restricts to admin-pinned favourites, ordered by frequentOrder. */
  frequent?: boolean;
  type?: InventoryItemType;
}

/**
 * The catalogue module for #202 — CRUD, locale-aware search and barcode
 * lookup over `MaterialItem`. Split out from `InventoryService` because it's
 * a distinct sub-concern (catalogue identity) rather than the
 * template/vehicle-stock concerns that file already owns.
 */
@Injectable()
export class MaterialItemsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: MaterialItemFilters, page = 1, perPage = 100) {
    const skip = (page - 1) * perPage;
    const where = {
      isDeleted: false,
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.frequent ? { isFrequent: true } : {}),
      ...(filters.q
        ? {
            OR: [
              { namePt: { contains: filters.q, mode: 'insensitive' as const } },
              { nameEn: { contains: filters.q, mode: 'insensitive' as const } },
              { barcodes: { some: { code: { contains: filters.q, mode: 'insensitive' as const } } } },
            ],
          }
        : {}),
    };

    const orderBy = filters.frequent
      ? [{ frequentOrder: 'asc' as const }, { namePt: 'asc' as const }]
      : [{ namePt: 'asc' as const }];

    const [data, total] = await this.prisma.$transaction([
      this.prisma.materialItem.findMany({
        where,
        skip,
        take: perPage,
        orderBy,
        include: { barcodes: true },
      }),
      this.prisma.materialItem.count({ where }),
    ]);
    return { data, total, page, perPage };
  }

  async findOne(id: string) {
    const item = await this.prisma.materialItem.findFirst({
      where: { id, isDeleted: false },
      include: { barcodes: true },
    });
    if (!item) throw new NotFoundException(`Material item ${id} not found`);
    return item;
  }

  /** Scanned with the phone camera in the browser — 404 for an unknown or retired code. */
  async findByBarcode(code: string) {
    const barcode = await this.prisma.materialItemBarcode.findUnique({
      where: { code },
      include: { materialItem: { include: { barcodes: true } } },
    });
    if (!barcode || barcode.materialItem.isDeleted) {
      throw new NotFoundException(`No material item for barcode "${code}"`);
    }
    return barcode.materialItem;
  }

  async create(dto: CreateMaterialItemDto) {
    const barcodes = this.normalizeBarcodes(dto.barcodes);
    if (barcodes.length) await this.assertBarcodesFree(barcodes);

    return this.prisma.materialItem.create({
      data: {
        namePt: dto.namePt,
        nameEn: dto.nameEn ?? null,
        unit: dto.unit ?? 'pcs',
        type: dto.type,
        notes: dto.notes ?? null,
        isFrequent: dto.isFrequent ?? false,
        frequentOrder: dto.frequentOrder ?? 0,
        barcodes: { create: barcodes },
      },
      include: { barcodes: true },
    });
  }

  async update(id: string, dto: UpdateMaterialItemDto) {
    await this.findOne(id);

    const barcodes = dto.barcodes !== undefined ? this.normalizeBarcodes(dto.barcodes) : undefined;
    if (barcodes?.length) await this.assertBarcodesFree(barcodes, id);

    return this.prisma.$transaction(async (tx) => {
      if (barcodes !== undefined) {
        await tx.materialItemBarcode.deleteMany({ where: { materialItemId: id } });
      }
      return tx.materialItem.update({
        where: { id },
        data: {
          ...(dto.namePt !== undefined && { namePt: dto.namePt }),
          ...(dto.nameEn !== undefined && { nameEn: dto.nameEn }),
          ...(dto.unit !== undefined && { unit: dto.unit }),
          ...(dto.type !== undefined && { type: dto.type }),
          ...(dto.notes !== undefined && { notes: dto.notes }),
          ...(dto.isFrequent !== undefined && { isFrequent: dto.isFrequent }),
          ...(dto.frequentOrder !== undefined && { frequentOrder: dto.frequentOrder }),
          ...(barcodes !== undefined && { barcodes: { create: barcodes } }),
        },
        include: { barcodes: true },
      });
    });
  }

  /** Soft delete — a consumed item must stay resolvable on old reports. */
  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.materialItem.update({
      where: { id },
      data: { isDeleted: true },
    });
  }

  private normalizeBarcodes(barcodes?: MaterialItemBarcodeDto[]): { code: string; label: string | null }[] {
    if (!barcodes?.length) return [];
    const seen = new Set<string>();
    for (const b of barcodes) {
      const code = b.code.trim();
      if (seen.has(code)) {
        throw new ApiConflictException(
          'MATERIAL_ITEM_BARCODE_CONFLICT',
          `Barcode "${code}" is listed more than once on this item.`,
          { code },
        );
      }
      seen.add(code);
    }
    return barcodes.map((b) => ({ code: b.code.trim(), label: b.label ?? null }));
  }

  /** A barcode identifies exactly one catalogue item — reject a code already used elsewhere. */
  private async assertBarcodesFree(
    barcodes: { code: string; label: string | null }[],
    excludingItemId?: string,
  ) {
    const existing = await this.prisma.materialItemBarcode.findFirst({
      where: {
        code: { in: barcodes.map((b) => b.code) },
        ...(excludingItemId ? { materialItemId: { not: excludingItemId } } : {}),
      },
      include: { materialItem: true },
    });
    if (existing) {
      throw new ApiConflictException(
        'MATERIAL_ITEM_BARCODE_CONFLICT',
        `Barcode "${existing.code}" is already used by "${existing.materialItem.namePt}".`,
        { code: existing.code, itemName: existing.materialItem.namePt },
      );
    }
  }
}
