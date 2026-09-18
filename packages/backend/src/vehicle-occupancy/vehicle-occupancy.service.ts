import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VehicleOccupancySource } from '@redinfo/shared';

/**
 * Books a named vehicle to whatever is calling this — the schedules module
 * booking a shift, or any future consumer. Deliberately not a DTO: this is a
 * service-to-service contract, not an HTTP one (#222 adds the capability;
 * nothing calls it yet).
 */
export interface BookVehicleOccupancyInput {
  vehicleId: string;
  startsAt: Date;
  endsAt: Date;
  source: VehicleOccupancySource;
  sourceId: string;
  /** Required to succeed if the interval overlaps an existing booking. */
  overrideReason?: string;
  notes?: string;
}

@Injectable()
export class VehicleOccupancyService {
  constructor(private readonly prisma: PrismaService) {}

  /** Everything overlapping `[from, to)` for a vehicle, whatever its source. */
  async findInRange(from: Date, to: Date, vehicleId?: string) {
    return this.prisma.vehicleOccupancy.findMany({
      where: {
        ...(vehicleId ? { vehicleId } : {}),
        startsAt: { lt: to },
        endsAt: { gt: from },
      },
      orderBy: { startsAt: 'asc' },
    });
  }

  /** Existing bookings for one vehicle overlapping `[startsAt, endsAt)`. */
  async findConflicts(vehicleId: string, startsAt: Date, endsAt: Date, excludeId?: string) {
    return this.prisma.vehicleOccupancy.findMany({
      where: {
        vehicleId,
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      orderBy: { startsAt: 'asc' },
    });
  }

  /**
   * Books a named vehicle for an interval. Conflicts are warnings a planner
   * can override, never a hard block — mirrors `ScheduleAssignment.isOverride`
   * / `certificationOverrideReason`: an overlapping interval is rejected
   * unless `overrideReason` is supplied, in which case it succeeds and the
   * reason is persisted.
   */
  async book(input: BookVehicleOccupancyInput) {
    const conflicts = await this.findConflicts(input.vehicleId, input.startsAt, input.endsAt);
    if (conflicts.length > 0 && !input.overrideReason) {
      throw new ConflictException(
        `Vehicle ${input.vehicleId} is already committed for an overlapping interval`,
      );
    }

    return this.prisma.vehicleOccupancy.create({
      data: {
        vehicleId: input.vehicleId,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        source: input.source,
        sourceId: input.sourceId,
        overrideReason: input.overrideReason ?? null,
        notes: input.notes ?? null,
      },
    });
  }

  /**
   * Write-through for a source row that owns exactly one occupancy interval
   * (e.g. a `MaintenanceEntry`). Creates or moves the interval without the
   * conflict check `book` applies — this is bookkeeping for a row that
   * already exists, not a new commitment a planner is weighing, and two
   * legitimate source rows (two maintenance entries the same day) can share
   * a vehicle without either being an "override".
   */
  async syncForSource(
    source: VehicleOccupancySource,
    sourceId: string,
    fields: { vehicleId: string; startsAt: Date; endsAt: Date; notes?: string | null },
  ) {
    const existing = await this.prisma.vehicleOccupancy.findFirst({ where: { source, sourceId } });

    const data = {
      vehicleId: fields.vehicleId,
      startsAt: fields.startsAt,
      endsAt: fields.endsAt,
      notes: fields.notes ?? null,
    };

    if (existing) {
      return this.prisma.vehicleOccupancy.update({ where: { id: existing.id }, data });
    }

    return this.prisma.vehicleOccupancy.create({ data: { ...data, source, sourceId } });
  }

  /** Removes the occupancy interval for a deleted source row, if any. */
  async removeForSource(source: VehicleOccupancySource, sourceId: string) {
    await this.prisma.vehicleOccupancy.deleteMany({ where: { source, sourceId } });
  }

  /** The one interval a source row that owns exactly one occupancy interval
   * currently has, if any — what a fresh read (e.g. a trip re-checking
   * whether its vehicle is still clear) starts from. */
  async findForSource(source: VehicleOccupancySource, sourceId: string) {
    return this.prisma.vehicleOccupancy.findFirst({ where: { source, sourceId } });
  }

  /** Batched `findForSource` across many source rows of the same kind — the
   * week strip's (#247 stage 6) committed-vehicle-hours count, one call for
   * every trip on a date rather than one per trip. */
  async findManyForSource(source: VehicleOccupancySource, sourceIds: string[]) {
    if (sourceIds.length === 0) return [];
    return this.prisma.vehicleOccupancy.findMany({ where: { source, sourceId: { in: sourceIds } } });
  }

  /**
   * `book`'s conflict-check-unless-overridden logic, upserting by
   * `(source, sourceId)` like `syncForSource` — for a source row that owns
   * exactly one interval but, unlike `MaintenanceEntry`, has that interval
   * move over its own life (a `Trip`'s window grows and shrinks as stops are
   * added, moved or removed) while conflicts still matter every time it
   * does. Neither existing method fits alone: `book` has no notion of "the
   * same commitment, updated", and `syncForSource` never checks for
   * conflicts at all.
   */
  async rebookForSource(
    source: VehicleOccupancySource,
    sourceId: string,
    fields: { vehicleId: string; startsAt: Date; endsAt: Date; notes?: string | null },
    overrideReason?: string,
  ) {
    const existing = await this.prisma.vehicleOccupancy.findFirst({ where: { source, sourceId } });

    const conflicts = await this.findConflicts(fields.vehicleId, fields.startsAt, fields.endsAt, existing?.id);
    if (conflicts.length > 0 && !overrideReason) {
      throw new ConflictException(
        `Vehicle ${fields.vehicleId} is already committed for an overlapping interval`,
      );
    }

    const data = {
      vehicleId: fields.vehicleId,
      startsAt: fields.startsAt,
      endsAt: fields.endsAt,
      overrideReason: overrideReason ?? null,
      notes: fields.notes ?? null,
    };

    if (existing) {
      return this.prisma.vehicleOccupancy.update({ where: { id: existing.id }, data });
    }
    return this.prisma.vehicleOccupancy.create({ data: { ...data, source, sourceId } });
  }
}
