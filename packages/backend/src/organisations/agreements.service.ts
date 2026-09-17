import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Agreement, validateAgreement } from '@redinfo/shared';
import { toIsoDate } from '../utils/date.util';
import { PrismaService } from '../prisma/prisma.service';
import { serializeOrganisation } from './organisations.service';
import { CreateAgreementDto } from './dto/create-agreement.dto';
import { UpdateAgreementDto } from './dto/update-agreement.dto';

const AGREEMENT_INCLUDE = { payerOrganisation: { include: { references: true } } } as const;

type AgreementRow = {
  id: string;
  payerOrganisationId: string;
  name: string;
  externalReference: string | null;
  validFrom: Date;
  validTo: Date | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  payerOrganisation?: Parameters<typeof serializeOrganisation>[0] | null;
};

export function serializeAgreement(row: AgreementRow): Agreement {
  return {
    id: row.id,
    payerOrganisationId: row.payerOrganisationId,
    ...(row.payerOrganisation ? { payerOrganisation: serializeOrganisation(row.payerOrganisation) } : {}),
    name: row.name,
    externalReference: row.externalReference,
    validFrom: toIsoDate(row.validFrom),
    validTo: row.validTo ? toIsoDate(row.validTo) : null,
    notes: row.notes,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * The terms a given transport falls under (#227) — the national health
 * service agreement, an insurer's, a private arrangement — scoped to the
 * organisation paying under it. Deliberately no tariff or rate fields:
 * billing is modelled here, never performed.
 */
@Injectable()
export class AgreementsService {
  constructor(private readonly prisma: PrismaService) {}

  async findManaged(page = 1, perPage = 100, includeInactive = true, payerOrganisationId?: string) {
    const skip = (page - 1) * perPage;
    const where = {
      ...(includeInactive ? {} : { isActive: true }),
      ...(payerOrganisationId ? { payerOrganisationId } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.agreement.findMany({
        where,
        skip,
        take: perPage,
        orderBy: [{ validFrom: 'desc' }, { name: 'asc' }],
        include: AGREEMENT_INCLUDE,
      }),
      this.prisma.agreement.count({ where }),
    ]);

    return { data: rows.map(serializeAgreement), total, page, perPage };
  }

  async findOne(id: string): Promise<Agreement> {
    const row = await this.prisma.agreement.findUnique({ where: { id }, include: AGREEMENT_INCLUDE });
    if (!row) throw new NotFoundException(`Agreement ${id} not found`);
    return serializeAgreement(row);
  }

  async create(dto: CreateAgreementDto): Promise<Agreement> {
    const input = this.normalize(dto);
    const error = validateAgreement(input);
    if (error) throw new BadRequestException(error);

    await this.assertPayerOrganisation(input.payerOrganisationId);

    const created = await this.prisma.agreement.create({
      data: {
        payerOrganisationId: input.payerOrganisationId,
        name: input.name,
        externalReference: input.externalReference ?? null,
        validFrom: new Date(`${input.validFrom}T00:00:00.000Z`),
        validTo: input.validTo ? new Date(`${input.validTo}T00:00:00.000Z`) : null,
        notes: input.notes ?? null,
        isActive: input.isActive ?? true,
      },
      include: AGREEMENT_INCLUDE,
    });
    return serializeAgreement(created);
  }

  async update(id: string, dto: UpdateAgreementDto): Promise<Agreement> {
    const current = await this.findOne(id);

    const merged = this.normalize({
      payerOrganisationId: dto.payerOrganisationId ?? current.payerOrganisationId,
      name: dto.name ?? current.name,
      externalReference:
        dto.externalReference !== undefined ? dto.externalReference : current.externalReference,
      validFrom: dto.validFrom ?? current.validFrom,
      validTo: dto.validTo !== undefined ? dto.validTo : current.validTo,
      notes: dto.notes !== undefined ? dto.notes : current.notes,
      isActive: dto.isActive !== undefined ? dto.isActive : current.isActive,
    });

    const error = validateAgreement(merged);
    if (error) throw new BadRequestException(error);

    if (merged.payerOrganisationId !== current.payerOrganisationId) {
      await this.assertPayerOrganisation(merged.payerOrganisationId);
    }

    const updated = await this.prisma.agreement.update({
      where: { id },
      data: {
        payerOrganisationId: merged.payerOrganisationId,
        name: merged.name,
        externalReference: merged.externalReference ?? null,
        validFrom: new Date(`${merged.validFrom}T00:00:00.000Z`),
        validTo: merged.validTo ? new Date(`${merged.validTo}T00:00:00.000Z`) : null,
        notes: merged.notes ?? null,
        isActive: merged.isActive ?? true,
      },
      include: AGREEMENT_INCLUDE,
    });
    return serializeAgreement(updated);
  }

  /** Nothing references an agreement yet (the transport request that will is a later story), so this is a plain delete. */
  async remove(id: string): Promise<Agreement> {
    await this.findOne(id);
    const deleted = await this.prisma.agreement.delete({ where: { id }, include: AGREEMENT_INCLUDE });
    return serializeAgreement(deleted);
  }

  private normalize(dto: {
    payerOrganisationId: string;
    name: string;
    externalReference?: string | null;
    validFrom: string;
    validTo?: string | null;
    notes?: string | null;
    isActive?: boolean;
  }) {
    return {
      payerOrganisationId: dto.payerOrganisationId,
      name: dto.name?.trim() ?? '',
      externalReference: dto.externalReference?.trim() || null,
      validFrom: dto.validFrom,
      validTo: dto.validTo || null,
      notes: dto.notes?.trim() || null,
      isActive: dto.isActive,
    };
  }

  /** An agreement can only belong to an organisation flagged as a payer. */
  private async assertPayerOrganisation(organisationId: string): Promise<void> {
    const organisation = await this.prisma.organisation.findUnique({ where: { id: organisationId } });
    if (!organisation) {
      throw new BadRequestException(`Organisation ${organisationId} not found`);
    }
    if (!organisation.isPayer) {
      throw new BadRequestException('Only an organisation flagged as a payer can hold an agreement.');
    }
  }
}
