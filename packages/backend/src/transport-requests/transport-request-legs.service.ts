import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CancelTransportLegInput,
  LegDirection,
  LegStatus,
  TransportLeg,
  UpdateTransportLegInput,
  validateCancelTransportLeg,
  validateUpdateTransportLeg,
} from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { isoDateRange, isoDayOfWeek, parseIsoDate, toIsoDate } from '../utils/date.util';
import { CancelTransportLegDto } from './dto/cancel-transport-leg.dto';
import { UpdateTransportLegDto } from './dto/update-transport-leg.dto';
import { TRANSPORT_LEG_INCLUDE, TransportLegRow, serializeTransportLeg } from './treatment-plan-leg.serializer';

/** The minimum a leg needs to be generated for — shared by a plan's own
 * `transportRequest` and by `generateOneOff`'s freestanding lookup, so
 * `buildLeg` doesn't care which path produced it. */
interface RequestForGeneration {
  id: string;
  originAddress: string;
  originLatitude: number | null;
  originLongitude: number | null;
  isRoundTrip: boolean;
}

/**
 * Materialises and edits `TransportLeg` rows (#230) — the durable, billable
 * unit `TreatmentPlan` only generates. See the schema's own banner comment
 * for the modelling decision; see `generatedForDate`'s doc comment for why
 * the generator never keys off `date` directly.
 *
 * Editing, cancelling and marking no-show never touch the plan above a leg
 * — each is its own action here, none of them reach into `TreatmentPlan`.
 */
@Injectable()
export class TransportRequestLegsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllForRequest(transportRequestId: string): Promise<TransportLeg[]> {
    await this.assertRequestExists(transportRequestId);
    const rows = await this.prisma.transportLeg.findMany({
      where: { transportRequestId },
      include: TRANSPORT_LEG_INCLUDE,
      orderBy: [{ date: 'asc' }, { direction: 'asc' }],
    });
    return rows.map((row) => serializeTransportLeg(row as TransportLegRow));
  }

  /**
   * Materialises every leg a plan's validity period + `daysOfWeek` implies
   * that doesn't exist yet — outbound always, return only when the parent
   * referral `isRoundTrip`. Idempotent: existing rows are matched by
   * `generatedForDate`, not `date`, so a leg that's been cancelled,
   * rescheduled or hand-edited is never duplicated or resurrected (its row
   * still occupies the slot it was generated for, whatever `date` now says).
   * Safe to call repeatedly — creating a plan calls this once; editing one
   * calls it again to pick up a widened validity period or a changed
   * `daysOfWeek`, never to touch what's already there.
   *
   * Decision: `Holiday` rows do **not** suppress generation. Every other
   * consumer of `Holiday` in this codebase (`HolidaysService.isHoliday`,
   * `AvailabilityService`) treats it as informational shading for a person
   * planning around it, never a hard block — the same "warning, not a veto"
   * precedent `StaffAbsence` follows for the roster. A dialysis session
   * booked on a public holiday is still a session the patient needs; a
   * coordinator who actually can't run it that day cancels or reschedules
   * the individual leg (`cancel`/`update`), same as any other exception.
   */
  async generateForPlan(planId: string): Promise<number> {
    const plan = await this.prisma.treatmentPlan.findUnique({
      where: { id: planId },
      include: { transportRequest: true },
    });
    if (!plan) throw new NotFoundException(`Treatment plan ${planId} not found`);

    const occurrenceDates = isoDateRange(toIsoDate(plan.validFrom), toIsoDate(plan.validTo)).filter((date) =>
      plan.daysOfWeek.includes(isoDayOfWeek(date)),
    );

    const existing = await this.prisma.transportLeg.findMany({
      where: { treatmentPlanId: planId },
      select: { generatedForDate: true, direction: true },
    });
    const covered = new Set(existing.map((leg) => `${toIsoDate(leg.generatedForDate)}|${leg.direction}`));

    const request = plan.transportRequest;
    const rows: Prisma.TransportLegUncheckedCreateInput[] = [];
    for (const date of occurrenceDates) {
      if (!covered.has(`${date}|${LegDirection.OUTBOUND}`)) {
        rows.push(this.buildLeg(request, plan.id, plan.destinationFacilityId, date, LegDirection.OUTBOUND));
      }
      if (request.isRoundTrip && !covered.has(`${date}|${LegDirection.RETURN}`)) {
        rows.push(this.buildLeg(request, plan.id, plan.destinationFacilityId, date, LegDirection.RETURN));
      }
    }
    if (rows.length) await this.prisma.transportLeg.createMany({ data: rows });
    return rows.length;
  }

  /**
   * The one-off counterpart to `generateForPlan`, for a referral with no
   * `TreatmentPlan` above it at all: a single outbound (+ return, if
   * `isRoundTrip`) leg dated on the referral's own `appointmentAt`.
   * Idempotent the same way — a one-off referral has exactly one occurrence,
   * so "any un-planned leg already exists for this referral" is enough;
   * there is no recurrence pattern to re-check dates against.
   */
  async generateOneOff(transportRequestId: string): Promise<number> {
    const request = await this.prisma.transportRequest.findUnique({ where: { id: transportRequestId } });
    if (!request) throw new NotFoundException(`Transport request ${transportRequestId} not found`);

    const already = await this.prisma.transportLeg.count({
      where: { transportRequestId, treatmentPlanId: null },
    });
    if (already > 0) return 0;

    const date = toIsoDate(request.appointmentAt);
    const rows = [this.buildLeg(request, null, request.destinationFacilityId, date, LegDirection.OUTBOUND)];
    if (request.isRoundTrip) {
      rows.push(this.buildLeg(request, null, request.destinationFacilityId, date, LegDirection.RETURN));
    }
    await this.prisma.transportLeg.createMany({ data: rows });
    return rows.length;
  }

  /** Address/facility/time detail, plus a reschedule via `date` — never
   * `status`, `cancellationReason` or `cancellationSource`; those go through
   * `cancel`/`markNoShow` instead, same separation
   * `TransportRequestsService.decide` keeps from `update`. */
  async update(id: string, dto: UpdateTransportLegDto): Promise<TransportLeg> {
    const current = await this.prisma.transportLeg.findUnique({ where: { id } });
    if (!current) throw new NotFoundException(`Transport leg ${id} not found`);
    if (current.status === LegStatus.CANCELLED) {
      throw new ConflictException('A cancelled leg can no longer be edited.');
    }

    const input: UpdateTransportLegInput = {
      date: dto.date,
      originAddress: dto.originAddress !== undefined ? dto.originAddress : current.originAddress,
      originLatitude: dto.originLatitude !== undefined ? dto.originLatitude : current.originLatitude,
      originLongitude: dto.originLongitude !== undefined ? dto.originLongitude : current.originLongitude,
      originFacilityId: dto.originFacilityId !== undefined ? dto.originFacilityId : current.originFacilityId,
      destinationAddress: dto.destinationAddress !== undefined ? dto.destinationAddress : current.destinationAddress,
      destinationLatitude:
        dto.destinationLatitude !== undefined ? dto.destinationLatitude : current.destinationLatitude,
      destinationLongitude:
        dto.destinationLongitude !== undefined ? dto.destinationLongitude : current.destinationLongitude,
      destinationFacilityId:
        dto.destinationFacilityId !== undefined ? dto.destinationFacilityId : current.destinationFacilityId,
      plannedPickupAt:
        dto.plannedPickupAt !== undefined ? dto.plannedPickupAt : (current.plannedPickupAt?.toISOString() ?? null),
      plannedDropoffAt:
        dto.plannedDropoffAt !== undefined ? dto.plannedDropoffAt : (current.plannedDropoffAt?.toISOString() ?? null),
    };
    const error = validateUpdateTransportLeg(input);
    if (error) throw new BadRequestException(error);

    if (input.originFacilityId) await this.assertFacilityExists(input.originFacilityId);
    if (input.destinationFacilityId) await this.assertFacilityExists(input.destinationFacilityId);

    const updated = await this.prisma.transportLeg.update({
      where: { id },
      data: {
        date: input.date ? parseIsoDate(input.date) : undefined,
        originAddress: input.originAddress,
        originLatitude: input.originLatitude,
        originLongitude: input.originLongitude,
        originFacilityId: input.originFacilityId,
        destinationAddress: input.destinationAddress,
        destinationLatitude: input.destinationLatitude,
        destinationLongitude: input.destinationLongitude,
        destinationFacilityId: input.destinationFacilityId,
        plannedPickupAt: input.plannedPickupAt ? new Date(input.plannedPickupAt) : null,
        plannedDropoffAt: input.plannedDropoffAt ? new Date(input.plannedDropoffAt) : null,
      },
      include: TRANSPORT_LEG_INCLUDE,
    });
    return serializeTransportLeg(updated as TransportLegRow);
  }

  /** Never touches the plan above the leg — see the module banner comment. */
  async cancel(id: string, dto: CancelTransportLegDto): Promise<TransportLeg> {
    const current = await this.prisma.transportLeg.findUnique({ where: { id } });
    if (!current) throw new NotFoundException(`Transport leg ${id} not found`);
    if (current.status === LegStatus.CANCELLED) throw new ConflictException('This leg is already cancelled.');
    if (current.status === LegStatus.COMPLETED) {
      throw new ConflictException('A completed leg can no longer be cancelled.');
    }

    const input: CancelTransportLegInput = { reason: dto.reason, source: dto.source };
    const error = validateCancelTransportLeg(input);
    if (error) throw new BadRequestException(error);

    const updated = await this.prisma.transportLeg.update({
      where: { id },
      data: {
        status: LegStatus.CANCELLED as never,
        cancellationReason: input.reason.trim(),
        cancellationSource: input.source as never,
      },
      include: TRANSPORT_LEG_INCLUDE,
    });
    return serializeTransportLeg(updated as TransportLegRow);
  }

  async markNoShow(id: string): Promise<TransportLeg> {
    const current = await this.prisma.transportLeg.findUnique({ where: { id } });
    if (!current) throw new NotFoundException(`Transport leg ${id} not found`);
    if (current.status !== LegStatus.PLANNED && current.status !== LegStatus.ASSIGNED) {
      throw new ConflictException('Only a planned or assigned leg can be marked as a no-show.');
    }

    const updated = await this.prisma.transportLeg.update({
      where: { id },
      data: { status: LegStatus.NO_SHOW as never },
      include: TRANSPORT_LEG_INCLUDE,
    });
    return serializeTransportLeg(updated as TransportLegRow);
  }

  /**
   * `direction` picks which end is the patient's own pickup address (free
   * text, from the referral) and which is the treatment facility
   * (structured): outbound goes address → facility, return goes facility →
   * address — the return leg's default destination, overridable per leg via
   * `update` without touching whatever generated it.
   */
  private buildLeg(
    request: RequestForGeneration,
    treatmentPlanId: string | null,
    destinationFacilityId: string,
    date: string,
    direction: LegDirection,
  ): Prisma.TransportLegUncheckedCreateInput {
    const parsedDate = parseIsoDate(date);
    const outbound = direction === LegDirection.OUTBOUND;
    return {
      transportRequestId: request.id,
      treatmentPlanId,
      date: parsedDate,
      generatedForDate: parsedDate,
      direction: direction as never,
      originAddress: outbound ? request.originAddress : null,
      originLatitude: outbound ? request.originLatitude : null,
      originLongitude: outbound ? request.originLongitude : null,
      originFacilityId: outbound ? null : destinationFacilityId,
      destinationAddress: outbound ? null : request.originAddress,
      destinationLatitude: outbound ? null : request.originLatitude,
      destinationLongitude: outbound ? null : request.originLongitude,
      destinationFacilityId: outbound ? destinationFacilityId : null,
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
