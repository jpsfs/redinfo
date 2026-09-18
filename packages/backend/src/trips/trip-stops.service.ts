import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  LegStatus,
  TripStopKind,
  TripStopWalkInput,
  VehicleOccupancySource,
  checkTripCapacity,
  computeTripOccupancyWindow,
  validateAssignTransportLeg,
  validateCreateTripStop,
  validateUpdateTripStop,
  walkTripStops,
} from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { DelegationSettingsService } from '../live-runs/delegation-settings.service';
import { VehicleOccupancyService } from '../vehicle-occupancy/vehicle-occupancy.service';
import { AssignTransportLegDto } from './dto/assign-transport-leg.dto';
import { CreateTripStopDto } from './dto/create-trip-stop.dto';
import { UpdateTripStopDto } from './dto/update-trip-stop.dto';
import { ReorderTripStopsDto } from './dto/reorder-trip-stops.dto';
import { TripStopRow, serializeTripStop, toWalkInput } from './trip.serializer';
import { loadPassengerRequirements, pickupLegIds } from './trip-passenger-requirements.util';

type TripForStops = {
  id: string;
  vehicleId: string;
  vehicle: { seatedCapacity: number; wheelchairPositions: number; stretcherPositions: number };
};

/**
 * Everything that changes a trip's stop sequence (#234): assigning/
 * unassigning a leg, adding a `WAIT`/`RETURN_TO_BASE`/`DEPART_FROM_BASE` stop, editing a stop,
 * and reordering. Capacity is checked against the *candidate* stop set
 * before anything is committed — a hard, unoverridable constraint, unlike
 * the vehicle-availability check `syncOccupancy` delegates to
 * `VehicleOccupancyService.rebookForSource`. Every method here ends by
 * recomputing the trip's one `VehicleOccupancy` interval, since the window a
 * `Trip` owns is a pure function of its current stops (see the shared
 * `computeTripOccupancyWindow`'s doc comment).
 */
@Injectable()
export class TripStopsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly delegationSettings: DelegationSettingsService,
    private readonly vehicleOccupancy: VehicleOccupancyService,
  ) {}

  /**
   * Creates or **moves** the leg's `PICKUP`+`DROPOFF` pair onto this trip —
   * re-assigning an already-assigned leg is this same call. Implemented as
   * delete-then-recreate under the hood (simplest way to keep "which stop is
   * pickup vs. dropoff" unambiguous), but that's an implementation detail:
   * the caller only ever makes one call, on either the first assignment or a
   * later reassignment.
   */
  async assignLegToTrip(tripId: string, dto: AssignTransportLegDto) {
    const error = validateAssignTransportLeg({
      transportLegId: dto.transportLegId,
      pickupPlannedAt: dto.pickupPlannedAt,
      dropoffPlannedAt: dto.dropoffPlannedAt,
    });
    if (error) throw new BadRequestException(error);

    const trip = await this.findTripForStops(tripId);
    const leg = await this.prisma.transportLeg.findUnique({ where: { id: dto.transportLegId } });
    if (!leg) throw new NotFoundException(`Transport leg ${dto.transportLegId} not found`);
    if (leg.status === LegStatus.CANCELLED || leg.status === LegStatus.NO_SHOW || leg.status === LegStatus.COMPLETED) {
      throw new ConflictException(`A ${leg.status.toLowerCase()} leg cannot be assigned to a trip.`);
    }

    const existingStops = await this.prisma.tripStop.findMany({ where: { transportLegId: leg.id } });
    const previousTripIds = [...new Set(existingStops.map((s) => s.tripId))];

    const otherStops = await this.prisma.tripStop.findMany({ where: { tripId, transportLegId: { not: leg.id } } });
    const nextSequence = otherStops.length ? Math.max(...otherStops.map((s) => s.sequence)) + 1 : 1;

    const pickupStub: TripStopWalkInput = {
      id: 'new-pickup',
      sequence: nextSequence,
      kind: TripStopKind.PICKUP,
      transportLegId: leg.id,
      plannedAt: dto.pickupPlannedAt,
    };
    const dropoffStub: TripStopWalkInput = {
      id: 'new-dropoff',
      sequence: nextSequence + 1,
      kind: TripStopKind.DROPOFF,
      transportLegId: leg.id,
      plannedAt: dto.dropoffPlannedAt,
    };
    const candidateWalkInputs: TripStopWalkInput[] = [
      ...otherStops.map((s) => toWalkInput(s)),
      pickupStub,
      dropoffStub,
    ];
    const passengerRequirements = await loadPassengerRequirements(this.prisma, pickupLegIds(candidateWalkInputs));
    for (const input of candidateWalkInputs) {
      if (input.kind === TripStopKind.PICKUP && input.transportLegId) {
        input.passengerRequirement = passengerRequirements.get(input.transportLegId);
      }
    }
    const capacityIssues = checkTripCapacity(walkTripStops(candidateWalkInputs), trip.vehicle);
    if (capacityIssues.length > 0) {
      throw new ConflictException(capacityIssues[0].message);
    }

    const [pickup, dropoff] = await this.prisma.$transaction([
      this.prisma.tripStop.deleteMany({ where: { transportLegId: leg.id } }),
      this.prisma.tripStop.create({
        data: {
          tripId,
          sequence: nextSequence,
          kind: TripStopKind.PICKUP,
          transportLegId: leg.id,
          facilityId: leg.originFacilityId,
          address: leg.originAddress,
          latitude: leg.originLatitude,
          longitude: leg.originLongitude,
          plannedAt: new Date(dto.pickupPlannedAt),
        },
      }),
      this.prisma.tripStop.create({
        data: {
          tripId,
          sequence: nextSequence + 1,
          kind: TripStopKind.DROPOFF,
          transportLegId: leg.id,
          facilityId: leg.destinationFacilityId,
          address: leg.destinationAddress,
          latitude: leg.destinationLatitude,
          longitude: leg.destinationLongitude,
          plannedAt: new Date(dto.dropoffPlannedAt),
        },
      }),
    ]).then(([, pickupRow, dropoffRow]) => [pickupRow, dropoffRow]);

    if (leg.status === LegStatus.PLANNED) {
      await this.prisma.transportLeg.update({ where: { id: leg.id }, data: { status: LegStatus.ASSIGNED as never } });
    }

    await this.syncOccupancy(tripId, dto.vehicleOverrideReason ?? undefined);
    for (const previousTripId of previousTripIds) {
      if (previousTripId !== tripId) await this.syncOccupancy(previousTripId);
    }

    return { pickup: serializeTripStop(pickup as TripStopRow), dropoff: serializeTripStop(dropoff as TripStopRow) };
  }

  /** Deletes the leg's `PICKUP`+`DROPOFF` pair off this trip, reverting the
   * leg to `PLANNED` if it hadn't progressed past `ASSIGNED`. */
  async unassignLeg(tripId: string, legId: string): Promise<void> {
    const stops = await this.prisma.tripStop.findMany({ where: { tripId, transportLegId: legId } });
    if (stops.length === 0) throw new NotFoundException(`Leg ${legId} is not assigned to trip ${tripId}`);

    await this.prisma.tripStop.deleteMany({ where: { tripId, transportLegId: legId } });

    const leg = await this.prisma.transportLeg.findUnique({ where: { id: legId } });
    if (leg?.status === LegStatus.ASSIGNED) {
      await this.prisma.transportLeg.update({ where: { id: legId }, data: { status: LegStatus.PLANNED as never } });
    }

    await this.syncOccupancy(tripId);
  }

  /** A `WAIT`/`RETURN_TO_BASE` stop, appended at the end of the current
   * sequence, or a `DEPART_FROM_BASE` stop, prepended before the first —
   * the vehicle leaves base before its first stop, whatever order the
   * planner happens to add it in. `PICKUP`/`DROPOFF` are refused here — see
   * `assignLegToTrip`. */
  async addStop(tripId: string, dto: CreateTripStopDto) {
    const error = validateCreateTripStop({
      kind: dto.kind,
      plannedAt: dto.plannedAt,
      facilityId: dto.facilityId,
      dwellMinutes: dto.dwellMinutes,
    });
    if (error) throw new BadRequestException(error);

    await this.findTripForStops(tripId);
    const existing = await this.prisma.tripStop.findMany({ where: { tripId }, select: { sequence: true } });
    const nextSequence =
      dto.kind === TripStopKind.DEPART_FROM_BASE
        ? existing.length
          ? Math.min(...existing.map((s) => s.sequence)) - 1
          : 1
        : (existing.length ? Math.max(...existing.map((s) => s.sequence)) : 0) + 1;

    let facilityId: string | null = null;
    let address: string | null = null;
    let latitude: number | null = null;
    let longitude: number | null = null;

    if (dto.kind === TripStopKind.WAIT) {
      const facility = await this.prisma.facility.findUnique({ where: { id: dto.facilityId as string } });
      if (!facility) throw new BadRequestException(`Facility ${dto.facilityId} not found`);
      facilityId = facility.id;
      address = facility.addressLine;
      latitude = facility.latitude;
      longitude = facility.longitude;
    } else {
      // RETURN_TO_BASE and DEPART_FROM_BASE both always target the
      // delegation's own base.
      const base = await this.delegationSettings.get();
      address = base.baseName;
      latitude = base.baseLatitude;
      longitude = base.baseLongitude;
    }

    const row = await this.prisma.tripStop.create({
      data: {
        tripId,
        sequence: nextSequence,
        kind: dto.kind,
        facilityId,
        address,
        latitude,
        longitude,
        plannedAt: new Date(dto.plannedAt),
        dwellDecision: dto.dwellDecision ?? null,
        dwellMinutes: dto.dwellMinutes ?? null,
      },
    });
    await this.syncOccupancy(tripId);
    return serializeTripStop(row as TripStopRow);
  }

  async updateStop(tripId: string, stopId: string, dto: UpdateTripStopDto) {
    const error = validateUpdateTripStop(dto);
    if (error) throw new BadRequestException(error);

    const stop = await this.findStopOrThrow(tripId, stopId);
    const row = await this.prisma.tripStop.update({
      where: { id: stop.id },
      data: {
        plannedAt: dto.plannedAt !== undefined ? new Date(dto.plannedAt) : undefined,
        actualAt: dto.actualAt !== undefined ? (dto.actualAt ? new Date(dto.actualAt) : null) : undefined,
        dwellDecision: dto.dwellDecision !== undefined ? dto.dwellDecision : undefined,
        dwellMinutes: dto.dwellMinutes !== undefined ? dto.dwellMinutes : undefined,
      },
    });
    await this.syncOccupancy(tripId);
    return serializeTripStop(row as TripStopRow);
  }

  /** Only a `WAIT`/`RETURN_TO_BASE`/`DEPART_FROM_BASE` stop may be deleted directly — a
   * `PICKUP`/`DROPOFF` stop always has a sibling for the same leg, and the
   * two must go together (`unassignLeg`). */
  async deleteStop(tripId: string, stopId: string): Promise<void> {
    const stop = await this.findStopOrThrow(tripId, stopId);
    if (stop.kind === TripStopKind.PICKUP || stop.kind === TripStopKind.DROPOFF) {
      throw new ConflictException('Unassign the leg instead of deleting a PICKUP/DROPOFF stop directly.');
    }
    await this.prisma.tripStop.delete({ where: { id: stop.id } });
    await this.syncOccupancy(tripId);
  }

  /**
   * The only way to reorder — a full ordered list of this trip's stop ids,
   * renumbered `1..N` in one transaction. Every other write appends at the
   * end (`max(sequence)+1`), so this is the sole place sequence collisions
   * are even possible; the two-phase renumber (negative, then final) is what
   * avoids tripping `@@unique([tripId, sequence])` mid-update.
   */
  async reorderStops(tripId: string, dto: ReorderTripStopsDto): Promise<void> {
    const stops = await this.prisma.tripStop.findMany({ where: { tripId } });
    const currentIds = new Set(stops.map((s) => s.id));
    const givenIds = new Set(dto.stopIds);
    if (currentIds.size !== givenIds.size || [...currentIds].some((id) => !givenIds.has(id))) {
      throw new BadRequestException("stopIds must be exactly this trip's current stops, in the desired order.");
    }

    const byId = new Map(stops.map((s) => [s.id, s]));
    const reordered = dto.stopIds.map((id, index) => ({ ...byId.get(id)!, sequence: index + 1 }));
    // A reorder never adds or removes a passenger, but it can change *when*
    // two legs' PICKUP/DROPOFF stops overlap — re-run the same capacity walk
    // against the candidate order before committing anything.
    const [walkInputs, vehicle] = await Promise.all([
      this.attachPassengerRequirements(reordered),
      this.vehicleCapacityFor(tripId),
    ]);
    const issues = checkTripCapacity(walkTripStops(walkInputs), vehicle);
    if (issues.length > 0) throw new ConflictException(issues[0].message);

    await this.prisma.$transaction([
      ...dto.stopIds.map((id, index) => this.prisma.tripStop.update({ where: { id }, data: { sequence: -(index + 1) } })),
      ...dto.stopIds.map((id, index) => this.prisma.tripStop.update({ where: { id }, data: { sequence: index + 1 } })),
    ]);
  }

  private async attachPassengerRequirements(stops: TripStopRow[]): Promise<TripStopWalkInput[]> {
    const walkInputs = stops.map((s) => toWalkInput(s));
    const requirements = await loadPassengerRequirements(this.prisma, pickupLegIds(walkInputs));
    for (const input of walkInputs) {
      if (input.kind === TripStopKind.PICKUP && input.transportLegId) {
        input.passengerRequirement = requirements.get(input.transportLegId);
      }
    }
    return walkInputs;
  }

  private async vehicleCapacityFor(tripId: string) {
    const trip = await this.findTripForStops(tripId);
    return trip.vehicle;
  }

  /** A trip's `VehicleOccupancy` interval is a pure function of its current
   * stops — recomputed and re-booked after every stop-set-changing write.
   * Removes the interval entirely once a trip has no stops left. */
  private async syncOccupancy(tripId: string, overrideReason?: string): Promise<void> {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId }, select: { vehicleId: true } });
    if (!trip) return;
    const stops = await this.prisma.tripStop.findMany({ where: { tripId } });
    if (stops.length === 0) {
      await this.vehicleOccupancy.removeForSource(VehicleOccupancySource.TRANSPORT_TRIP, tripId);
      return;
    }
    const window = computeTripOccupancyWindow(
      stops.map((s) => ({ plannedAt: s.plannedAt.toISOString(), dwellMinutes: s.dwellMinutes })),
    );
    await this.vehicleOccupancy.rebookForSource(
      VehicleOccupancySource.TRANSPORT_TRIP,
      tripId,
      { vehicleId: trip.vehicleId, startsAt: new Date(window.startsAt), endsAt: new Date(window.endsAt) },
      overrideReason,
    );
  }

  private async findTripForStops(tripId: string): Promise<TripForStops> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: { vehicle: { select: { seatedCapacity: true, wheelchairPositions: true, stretcherPositions: true } } },
    });
    if (!trip) throw new NotFoundException(`Trip ${tripId} not found`);
    return trip;
  }

  private async findStopOrThrow(tripId: string, stopId: string) {
    const stop = await this.prisma.tripStop.findUnique({ where: { id: stopId } });
    if (!stop || stop.tripId !== tripId) throw new NotFoundException(`Stop ${stopId} not found on trip ${tripId}`);
    return stop;
  }
}
