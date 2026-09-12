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
}
