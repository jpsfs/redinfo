import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TreatmentPlan, TreatmentPlanInput, validateTreatmentPlan } from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { parseIsoDate } from '../utils/date.util';
import { CreateTreatmentPlanDto } from './dto/create-treatment-plan.dto';
import { UpdateTreatmentPlanDto } from './dto/update-treatment-plan.dto';
import { TransportRequestLegsService } from './transport-request-legs.service';
import { TREATMENT_PLAN_INCLUDE, TreatmentPlanRow, serializeTreatmentPlan } from './treatment-plan-leg.serializer';

/**
 * `TreatmentPlan` CRUD (#230) — the generator, never the durable record; see
 * the schema's own banner comment. Creating or updating a plan always calls
 * `TransportRequestLegsService.generateForPlan` afterwards — safe to do
 * unconditionally since that method is idempotent, and it means a widened
 * validity period or a changed `daysOfWeek` is reflected in the leg list
 * immediately, with no separate "regenerate" action to remember to click.
 */
@Injectable()
export class TransportRequestTreatmentPlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly legs: TransportRequestLegsService,
  ) {}

  async findAllForRequest(transportRequestId: string): Promise<TreatmentPlan[]> {
    await this.assertRequestExists(transportRequestId);
    const rows = await this.prisma.treatmentPlan.findMany({
      where: { transportRequestId },
      include: TREATMENT_PLAN_INCLUDE,
      orderBy: { validFrom: 'asc' },
    });
    return rows.map((row) => serializeTreatmentPlan(row as TreatmentPlanRow));
  }

  async create(transportRequestId: string, dto: CreateTreatmentPlanDto): Promise<TreatmentPlan> {
    await this.assertRequestExists(transportRequestId);
    const input = this.normalize(dto);
    const error = validateTreatmentPlan(input);
    if (error) throw new BadRequestException(error);
    await this.assertFacilityExists(input.destinationFacilityId);

    const created = await this.prisma.treatmentPlan.create({
      data: {
        transportRequestId,
        destinationFacilityId: input.destinationFacilityId,
        daysOfWeek: input.daysOfWeek,
        treatmentStartTime: input.treatmentStartTime,
        treatmentEndTime: input.treatmentEndTime,
        validFrom: parseIsoDate(input.validFrom),
        validTo: parseIsoDate(input.validTo),
        notes: input.notes,
      } satisfies Prisma.TreatmentPlanUncheckedCreateInput,
      include: TREATMENT_PLAN_INCLUDE,
    });
    await this.legs.generateForPlan(created.id);
    return serializeTreatmentPlan(created as TreatmentPlanRow);
  }

  async update(id: string, dto: UpdateTreatmentPlanDto): Promise<TreatmentPlan> {
    const current = await this.prisma.treatmentPlan.findUnique({ where: { id } });
    if (!current) throw new NotFoundException(`Treatment plan ${id} not found`);

    const input = this.normalize({
      destinationFacilityId: dto.destinationFacilityId ?? current.destinationFacilityId,
      daysOfWeek: dto.daysOfWeek ?? current.daysOfWeek,
      treatmentStartTime: dto.treatmentStartTime ?? current.treatmentStartTime,
      treatmentEndTime: dto.treatmentEndTime !== undefined ? dto.treatmentEndTime : current.treatmentEndTime,
      validFrom: dto.validFrom ?? current.validFrom.toISOString(),
      validTo: dto.validTo ?? current.validTo.toISOString(),
      notes: dto.notes !== undefined ? dto.notes : current.notes,
    });
    const error = validateTreatmentPlan(input);
    if (error) throw new BadRequestException(error);
    if (input.destinationFacilityId !== current.destinationFacilityId) {
      await this.assertFacilityExists(input.destinationFacilityId);
    }

    const updated = await this.prisma.treatmentPlan.update({
      where: { id },
      data: {
        destinationFacilityId: input.destinationFacilityId,
        daysOfWeek: input.daysOfWeek,
        treatmentStartTime: input.treatmentStartTime,
        treatmentEndTime: input.treatmentEndTime,
        validFrom: parseIsoDate(input.validFrom),
        validTo: parseIsoDate(input.validTo),
        notes: input.notes,
      },
      include: TREATMENT_PLAN_INCLUDE,
    });
    await this.legs.generateForPlan(id);
    return serializeTreatmentPlan(updated as TreatmentPlanRow);
  }

  private normalize(dto: {
    destinationFacilityId: string;
    daysOfWeek: number[];
    treatmentStartTime: string;
    treatmentEndTime?: string | null;
    validFrom: string;
    validTo: string;
    notes?: string | null;
  }): TreatmentPlanInput {
    return {
      destinationFacilityId: dto.destinationFacilityId,
      // Sorted for a stable read order, never deduped — a duplicate day is a
      // validation error (`validateTreatmentPlan`), not something to swallow.
      daysOfWeek: [...dto.daysOfWeek].sort((a, b) => a - b),
      treatmentStartTime: dto.treatmentStartTime,
      treatmentEndTime: dto.treatmentEndTime?.trim() || null,
      validFrom: dto.validFrom.slice(0, 10),
      validTo: dto.validTo.slice(0, 10),
      notes: dto.notes?.trim() || null,
    };
  }

  private async assertRequestExists(id: string): Promise<void> {
    const exists = await this.prisma.transportRequest.count({ where: { id } });
    if (!exists) throw new NotFoundException(`Transport request ${id} not found`);
  }

  private async assertFacilityExists(id: string): Promise<void> {
    const exists = await this.prisma.facility.count({ where: { id } });
    if (!exists) throw new BadRequestException(`Facility ${id} not found`);
  }
}
