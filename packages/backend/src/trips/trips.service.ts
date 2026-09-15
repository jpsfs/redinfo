import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ArrivalWindowWarning,
  LegDirection,
  PatientMobility,
  TransportPlanningBoard,
  TransportPlanningLane,
  TransportPlanningLeg,
  TripPlanIssue,
  TripStopKind,
  TripStopSegment,
  TripStopWalkInput,
  VehicleOccupancySource,
  arrivalWindowWarning,
  checkTripCapacity,
  computeEmptyLegs,
  computeTripOccupancyWindow,
  resolveArrivalWindowThresholds,
  walkTripStops,
} from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { parseIsoDate } from '../utils/date.util';
import { shiftBoundaryToInstant } from '../utils/timezone.util';
import { DelegationSettingsService } from '../live-runs/delegation-settings.service';
import { StaffAbsencesService } from '../staff-absences/staff-absences.service';
import { VehicleOccupancyService } from '../vehicle-occupancy/vehicle-occupancy.service';
import { TransportRequestLegsService } from '../transport-requests/transport-request-legs.service';
import { PatientsService, RequestUser } from '../patients/patients.service';
import { CreateTripDto } from './dto/create-trip.dto';
import { UpdateTripDto } from './dto/update-trip.dto';
import { TripRow, TripStopRow, serializeTrip, serializeTripCrewMember, serializeTripStop } from './trip.serializer';
import { loadPassengerRequirements, pickupLegIds } from './trip-passenger-requirements.util';

const TRIP_INCLUDE = {
  vehicle: {
    select: {
      seatedCapacity: true,
      wheelchairPositions: true,
      stretcherPositions: true,
      licensePlate: true,
      numeroCauda: true,
      vehicleType: true,
    },
  },
  crewMembers: true,
  stops: { orderBy: { sequence: 'asc' as const } },
} as const;

/** What `buildDetail`/`getBoard` need off a trip row — shared by `getDetail`'s
 * single-row load and `getBoard`'s per-date `findMany`. */
type TripDetailRow = Prisma.TripGetPayload<{ include: typeof TRIP_INCLUDE }>;

export interface TripDetail {
  trip: ReturnType<typeof serializeTrip>;
  crewMembers: ReturnType<typeof serializeTripCrewMember>[];
  stops: ReturnType<typeof serializeTripStop>[];
  /** Null when the trip has no stops yet. */
  occupancyWindow: { startsAt: string; endsAt: string } | null;
  emptyLegs: TripStopSegment[];
  issues: TripPlanIssue[];
}

/** Maps the leg-level arrival-timing read (#233) onto this story's ranked
 * severity — soft, informational, never a block. */
function toIssueLevel(warning: ArrivalWindowWarning): 'NOTE' | 'WARNING' | null {
  if (warning === 'TOO_EARLY') return 'NOTE';
  if (warning === 'LATE_WITHIN_TOLERANCE' || warning === 'LATE_BEYOND_TOLERANCE') return 'WARNING';
  return null;
}

/**
 * `Trip` CRUD and the read-time ranked validation (#234) — capacity,
 * freshly-rechecked crew/vehicle availability, and arrival timing. See the
 * shared banner comment (`walkTripStops` and friends) for why hard
 * constraints throw at write time (`TripStopsService`/`TripCrewService`)
 * while this method only ever reads and ranks, never blocking.
 */
@Injectable()
export class TripsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly delegationSettings: DelegationSettingsService,
    private readonly staffAbsences: StaffAbsencesService,
    private readonly vehicleOccupancy: VehicleOccupancyService,
    private readonly transportRequestLegs: TransportRequestLegsService,
    private readonly patients: PatientsService,
  ) {}

  async create(dto: CreateTripDto) {
    await this.assertVehicleExists(dto.vehicleId);
    const row = await this.prisma.trip.create({
      data: { date: parseIsoDate(dto.date), vehicleId: dto.vehicleId, notes: dto.notes ?? null },
    });
    return serializeTrip(row as TripRow);
  }

  async list(filter: { date?: string; vehicleId?: string }) {
    const rows = await this.prisma.trip.findMany({
      where: {
        ...(filter.date ? { date: parseIsoDate(filter.date) } : {}),
        ...(filter.vehicleId ? { vehicleId: filter.vehicleId } : {}),
      },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((row) => serializeTrip(row as TripRow));
  }

  async update(id: string, dto: UpdateTripDto) {
    await this.findTripOrThrow(id);
    const row = await this.prisma.trip.update({
      where: { id },
      data: {
        notes: dto.notes !== undefined ? dto.notes : undefined,
        status: dto.status,
      },
    });
    return serializeTrip(row as TripRow);
  }

  async remove(id: string): Promise<void> {
    await this.findTripOrThrow(id);
    await this.prisma.trip.delete({ where: { id } });
    await this.vehicleOccupancy.removeForSource(VehicleOccupancySource.TRANSPORT_TRIP, id);
  }

  async getDetail(id: string): Promise<TripDetail> {
    const row = await this.prisma.trip.findUnique({ where: { id }, include: TRIP_INCLUDE });
    if (!row) throw new NotFoundException(`Trip ${id} not found`);
    return this.buildDetail(row);
  }

  /**
   * `date` — every lane on it plus the legs still waiting to be dragged onto
   * one (#235). Loads every trip's ranked validation via `buildDetail`
   * exactly as `getDetail` does, one call per trip: a day's fleet is small
   * enough (tens, not thousands) that this stays a non-issue. Leg/patient
   * data is the one thing genuinely batched — once for the whole board,
   * never once per stop.
   */
  async getBoard(date: string, user: RequestUser): Promise<TransportPlanningBoard> {
    const rows = await this.prisma.trip.findMany({
      where: { date: parseIsoDate(date) },
      include: TRIP_INCLUDE,
      orderBy: [{ createdAt: 'asc' }],
    });

    const lanes: TransportPlanningLane[] = await Promise.all(
      rows.map(async (row) => ({
        ...(await this.buildDetail(row)),
        vehicle: {
          id: row.vehicleId,
          licensePlate: row.vehicle.licensePlate,
          numeroCauda: row.vehicle.numeroCauda,
          vehicleType: row.vehicle.vehicleType as never,
          seatedCapacity: row.vehicle.seatedCapacity,
          wheelchairPositions: row.vehicle.wheelchairPositions,
          stretcherPositions: row.vehicle.stretcherPositions,
        },
      })),
    );

    const assignedLegIds = [
      ...new Set(
        rows.flatMap((row) => (row.stops as TripStopRow[]).map((stop) => stop.transportLegId).filter((id): id is string => !!id)),
      ),
    ];
    const [assignedLegs, unassignedLegs] = await Promise.all([
      this.transportRequestLegs.findByIds(assignedLegIds),
      this.transportRequestLegs.findUnassignedForDate(date),
    ]);
    const allLegs = [...assignedLegs, ...unassignedLegs];

    const requestIds = [...new Set(allLegs.map((leg) => leg.transportRequestId))];
    const requests = await this.prisma.transportRequest.findMany({
      where: { id: { in: requestIds } },
      select: { id: true, patientId: true },
    });
    const patientIdByRequestId = new Map(requests.map((r) => [r.id, r.patientId]));
    const patientIds = [...new Set([...patientIdByRequestId.values()])];
    const patientDisplay = await this.patients.findManyForDisplay(patientIds, user);

    const legsById: Record<string, TransportPlanningLeg> = {};
    for (const leg of allLegs) {
      const patientId = patientIdByRequestId.get(leg.transportRequestId) ?? '';
      const display = patientDisplay.get(patientId);
      legsById[leg.id] = {
        ...leg,
        patientId,
        patientMobility: display?.mobility ?? PatientMobility.AMBULATORY,
        ...(display?.fullName ? { patientName: display.fullName } : {}),
      };
    }

    return {
      date,
      lanes,
      legsById,
      unassignedLegIds: unassignedLegs.map((leg) => leg.id),
    };
  }

  private async buildDetail(row: TripDetailRow): Promise<TripDetail> {
    const stops = row.stops as TripStopRow[];
    const [passengerRequirements, absences, occupancyConflicts] = await Promise.all([
      loadPassengerRequirements(this.prisma, pickupLegIds(stops)),
      this.staffAbsences.findOverlapping(row.date.toISOString().slice(0, 10), row.date.toISOString().slice(0, 10)),
      this.checkVehicleAvailability(row.id, row.vehicleId, stops),
    ]);

    const walkInputs: TripStopWalkInput[] = stops.map((stop) => ({
      id: stop.id,
      sequence: stop.sequence,
      kind: stop.kind as TripStopKind,
      transportLegId: stop.transportLegId,
      plannedAt: stop.plannedAt.toISOString(),
      dwellMinutes: stop.dwellMinutes,
      passengerRequirement:
        stop.kind === TripStopKind.PICKUP && stop.transportLegId
          ? passengerRequirements.get(stop.transportLegId)
          : undefined,
    }));
    const segments = walkTripStops(walkInputs);

    const issues: TripPlanIssue[] = [
      ...checkTripCapacity(segments, row.vehicle),
      ...occupancyConflicts,
      ...(await this.checkCrewAvailability(row.crewMembers, absentUserIds(absences))),
      ...(await this.checkArrivalTiming(stops)),
    ];

    return {
      trip: serializeTrip(row as TripRow),
      crewMembers: row.crewMembers.map((member) => serializeTripCrewMember(member)),
      stops: stops.map((stop) => serializeTripStop(stop)),
      occupancyWindow: stops.length
        ? computeTripOccupancyWindow(stops.map((s) => ({ plannedAt: s.plannedAt.toISOString(), dwellMinutes: s.dwellMinutes })))
        : null,
      emptyLegs: computeEmptyLegs(segments),
      issues,
    };
  }

  /** A vehicle conflict is only worth flagging when this trip's own
   * occupancy row carries no override — an override already on file means
   * the coordinator accepted it and this shouldn't nag every time the board
   * loads. A conflict that appears later against a *different* row (e.g. a
   * shift booked afterwards) still surfaces, which is the point of
   * rechecking fresh on every read rather than trusting the write-time check
   * forever. */
  private async checkVehicleAvailability(tripId: string, vehicleId: string, stops: TripStopRow[]): Promise<TripPlanIssue[]> {
    if (stops.length === 0) return [];
    const window = computeTripOccupancyWindow(
      stops.map((s) => ({ plannedAt: s.plannedAt.toISOString(), dwellMinutes: s.dwellMinutes })),
    );
    const own = await this.vehicleOccupancy.findForSource(VehicleOccupancySource.TRANSPORT_TRIP, tripId);
    if (own?.overrideReason) return [];

    const conflicts = await this.vehicleOccupancy.findConflicts(
      vehicleId,
      new Date(window.startsAt),
      new Date(window.endsAt),
      own?.id,
    );
    if (conflicts.length === 0) return [];
    return [
      {
        level: 'ERROR',
        code: 'VEHICLE_UNAVAILABLE',
        message: `This vehicle is already committed for an overlapping interval (${conflicts.length} conflict${
          conflicts.length > 1 ? 's' : ''
        }).`,
      },
    ];
  }

  private async checkCrewAvailability(
    crewMembers: { id: string; userId: string; overrideReason: string | null }[],
    absentUserIds: Set<string>,
  ): Promise<TripPlanIssue[]> {
    return crewMembers
      .filter((member) => !member.overrideReason && absentUserIds.has(member.userId))
      .map((member) => ({
        level: 'ERROR' as const,
        code: 'CREW_UNAVAILABLE',
        message: `Crew member ${member.userId} is recorded absent on this trip's date.`,
      }));
  }

  /** Arrival-timing NOTE/WARNING against a `DROPOFF` stop for an `OUTBOUND`
   * leg — soft, and never suppressed by an override, since there is nothing
   * to override: a human decides what to do about it, the board just ranks it. */
  private async checkArrivalTiming(stops: TripStopRow[]): Promise<TripPlanIssue[]> {
    const dropoffLegIds = [
      ...new Set(
        stops
          .filter((s) => s.kind === TripStopKind.DROPOFF && s.transportLegId)
          .map((s) => s.transportLegId as string),
      ),
    ];
    if (dropoffLegIds.length === 0) return [];

    const [legs, thresholds] = await Promise.all([
      this.prisma.transportLeg.findMany({
        where: { id: { in: dropoffLegIds } },
        include: {
          destinationFacility: true,
          transportRequest: { select: { occurrenceType: true, appointmentAt: true } },
          treatmentPlan: { select: { treatmentStartTime: true } },
        },
      }),
      this.delegationSettings.get(),
    ]);
    const legById = new Map(legs.map((leg) => [leg.id, leg]));

    const issues: TripPlanIssue[] = [];
    for (const stop of stops) {
      if (stop.kind !== TripStopKind.DROPOFF || !stop.transportLegId) continue;
      const leg = legById.get(stop.transportLegId);
      if (!leg || leg.direction !== LegDirection.OUTBOUND) continue;

      const appointmentAt = leg.treatmentPlan
        ? shiftBoundaryToInstant(
            leg.date.toISOString().slice(0, 10),
            timeOfDayToMinutes(leg.treatmentPlan.treatmentStartTime),
          ).toISOString()
        : leg.transportRequest.appointmentAt.toISOString();
      const effectiveThresholds = resolveArrivalWindowThresholds(thresholds, leg.destinationFacility);
      const warning = arrivalWindowWarning(stop.plannedAt.toISOString(), appointmentAt, effectiveThresholds);
      const level = toIssueLevel(warning);
      if (!level) continue;
      issues.push({
        level,
        code: `ARRIVAL_${warning}`,
        message:
          warning === 'TOO_EARLY'
            ? 'Planned arrival is earlier than the preferred window.'
            : warning === 'LATE_WITHIN_TOLERANCE'
              ? 'Planned arrival is late, within the tolerated last-resort window.'
              : 'Planned arrival is late, beyond the tolerated window.',
        tripStopId: stop.id,
        transportLegId: leg.id,
      });
    }
    return issues;
  }

  private async findTripOrThrow(id: string) {
    const trip = await this.prisma.trip.findUnique({ where: { id } });
    if (!trip) throw new NotFoundException(`Trip ${id} not found`);
    return trip;
  }

  private async assertVehicleExists(id: string): Promise<void> {
    const exists = await this.prisma.vehicle.count({ where: { id } });
    if (!exists) throw new BadRequestException(`Vehicle ${id} not found`);
  }
}

function absentUserIds(absences: { userId: string }[]): Set<string> {
  return new Set(absences.map((absence) => absence.userId));
}

function timeOfDayToMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}
