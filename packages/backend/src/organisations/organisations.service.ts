import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Organisation, validateOrganisation } from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrganisationDto, OrganisationReferenceDto } from './dto/create-organisation.dto';
import { UpdateOrganisationDto } from './dto/update-organisation.dto';

const ORGANISATION_INCLUDE = { references: true } as const;

type OrganisationRow = {
  id: string;
  name: string;
  taxId: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  isRequester: boolean;
  isPayer: boolean;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  references?: { id: string; organisationId: string; code: string; description: string | null }[];
};

export function serializeOrganisation(row: OrganisationRow): Organisation {
  return {
    id: row.id,
    name: row.name,
    taxId: row.taxId,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    isRequester: row.isRequester,
    isPayer: row.isPayer,
    notes: row.notes,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(row.references ? { references: row.references } : {}),
  };
}

/**
 * A third party to a transport (#227): the body that requests it, the one
 * that pays for it, or both — role flags on one model, not separate tables,
 * because the same body routinely requests one transport and pays for
 * another (#219). Reference codes are a child collection replaced as a whole
 * set on save, the same contract `MaterialItemsService` uses for barcodes.
 */
@Injectable()
export class OrganisationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findManaged(
    page = 1,
    perPage = 100,
    includeInactive = true,
    isRequester?: boolean,
    isPayer?: boolean,
  ) {
    const skip = (page - 1) * perPage;
    const where = {
      ...(includeInactive ? {} : { isActive: true }),
      ...(isRequester !== undefined ? { isRequester } : {}),
      ...(isPayer !== undefined ? { isPayer } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.organisation.findMany({
        where,
        skip,
        take: perPage,
        orderBy: { name: 'asc' },
        include: ORGANISATION_INCLUDE,
      }),
      this.prisma.organisation.count({ where }),
    ]);

    return { data: rows.map(serializeOrganisation), total, page, perPage };
  }

  async findOne(id: string): Promise<Organisation> {
    const row = await this.prisma.organisation.findUnique({
      where: { id },
      include: ORGANISATION_INCLUDE,
    });
    if (!row) throw new NotFoundException(`Organisation ${id} not found`);
    return serializeOrganisation(row);
  }

  async create(dto: CreateOrganisationDto): Promise<Organisation> {
    const input = this.normalize(dto);
    const error = validateOrganisation(input);
    if (error) throw new BadRequestException(error);

    const references = this.normalizeReferences(dto.references);

    const created = await this.prisma.organisation.create({
      data: {
        name: input.name,
        taxId: input.taxId ?? null,
        contactEmail: input.contactEmail ?? null,
        contactPhone: input.contactPhone ?? null,
        isRequester: input.isRequester ?? false,
        isPayer: input.isPayer ?? false,
        notes: input.notes ?? null,
        isActive: input.isActive ?? true,
        references: { create: references },
      },
      include: ORGANISATION_INCLUDE,
    });
    return serializeOrganisation(created);
  }

  async update(id: string, dto: UpdateOrganisationDto): Promise<Organisation> {
    const current = await this.findOne(id);

    // Validate the record as it *will* be, not the patch: a name-only edit
    // must not accidentally clear the role that made the row manageable.
    const merged = this.normalize({
      name: dto.name ?? current.name,
      taxId: dto.taxId !== undefined ? dto.taxId : current.taxId,
      contactEmail: dto.contactEmail !== undefined ? dto.contactEmail : current.contactEmail,
      contactPhone: dto.contactPhone !== undefined ? dto.contactPhone : current.contactPhone,
      isRequester: dto.isRequester !== undefined ? dto.isRequester : current.isRequester,
      isPayer: dto.isPayer !== undefined ? dto.isPayer : current.isPayer,
      notes: dto.notes !== undefined ? dto.notes : current.notes,
      isActive: dto.isActive !== undefined ? dto.isActive : current.isActive,
      references: dto.references,
    });

    const error = validateOrganisation(merged);
    if (error) throw new BadRequestException(error);

    const references = dto.references !== undefined ? this.normalizeReferences(dto.references) : undefined;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (references !== undefined) {
        await tx.organisationReference.deleteMany({ where: { organisationId: id } });
      }
      return tx.organisation.update({
        where: { id },
        data: {
          name: merged.name,
          taxId: merged.taxId ?? null,
          contactEmail: merged.contactEmail ?? null,
          contactPhone: merged.contactPhone ?? null,
          isRequester: merged.isRequester ?? false,
          isPayer: merged.isPayer ?? false,
          notes: merged.notes ?? null,
          isActive: merged.isActive ?? true,
          ...(references !== undefined && { references: { create: references } }),
        },
        include: ORGANISATION_INCLUDE,
      });
    });
    return serializeOrganisation(updated);
  }

  /**
   * Retires the organisation rather than deleting it when an agreement still
   * names it as payer — an agreement's history has to keep naming who paid.
   * Otherwise deletes outright (its reference codes cascade with it).
   */
  async remove(id: string): Promise<Organisation> {
    await this.findOne(id);

    const referenced = await this.prisma.agreement.count({ where: { payerOrganisationId: id } });

    if (referenced > 0) {
      const retired = await this.prisma.organisation.update({
        where: { id },
        data: { isActive: false },
        include: ORGANISATION_INCLUDE,
      });
      return serializeOrganisation(retired);
    }

    const deleted = await this.prisma.organisation.delete({
      where: { id },
      include: ORGANISATION_INCLUDE,
    });
    return serializeOrganisation(deleted);
  }

  private normalize(dto: {
    name: string;
    taxId?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    isRequester?: boolean;
    isPayer?: boolean;
    notes?: string | null;
    isActive?: boolean;
    references?: OrganisationReferenceDto[];
  }) {
    return {
      name: dto.name?.trim() ?? '',
      taxId: dto.taxId?.trim() || null,
      contactEmail: dto.contactEmail?.trim() || null,
      contactPhone: dto.contactPhone?.trim() || null,
      isRequester: dto.isRequester,
      isPayer: dto.isPayer,
      notes: dto.notes?.trim() || null,
      isActive: dto.isActive,
      references: dto.references,
    };
  }

  private normalizeReferences(
    references?: OrganisationReferenceDto[],
  ): { code: string; description: string | null }[] {
    if (!references?.length) return [];
    const seen = new Set<string>();
    for (const reference of references) {
      const code = reference.code.trim();
      if (seen.has(code)) {
        throw new ConflictException(`Reference code "${code}" is listed more than once.`);
      }
      seen.add(code);
    }
    return references.map((reference) => ({
      code: reference.code.trim(),
      description: reference.description?.trim() || null,
    }));
  }
}
