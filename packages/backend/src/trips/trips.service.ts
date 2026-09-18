import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ArrivalWindowWarning,
  LegDirection,
  PatientMobility,
  TransportLeg,
  TransportPlanningBoard,
  TransportPlanningCrewMember,
  TransportPlanningLane,
  TransportPlanningLeg,
  TripCrewRequirement,
  TripJourneyDetail,
  TripPlanIssue,
  TripStopKind,
  TripStopSegment,
  TripStopWalkInput,
  VehicleDayJourneys,
  VehicleOccupancySource,
  VehicleType,
  arrivalWindowWarning,
  carriesStretcherPassenger,
  checkTripCapacity,
  checkTripCrew,
  computeEmptyLegs,
  computeTripOccupancyWindow,
  effectiveCertifications,
  resolveArrivalWindowThresholds,
  tripCrewRequirement,
  walkTripStops,
} from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { Coordinates, ROUTING_SERVICE, RoutingService } from '../routing/routing.interface';
import { CERT_HELD_SELECT, toHeldCertifications } from '../users/certifications.util';
import { parseIsoDate, toIsoDate } from '../utils/date.util';
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
import { TripLegTravelService } from './trip-leg-travel.service';

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
  crewMembers: TransportPlanningCrewMember[];
  /** What this trip's crew must look like given what it carries — see
   * `tripCrewRequirement`. Served alongside the issues so a caller can show
   * the bar as well as the shortfall. */
  crewRequirement: TripCrewRequirement;
  stops: ReturnType<typeof serializeTripStop>[];
  /** Null when the trip has no stops yet. */
  occupancyWindow: { startsAt: string; endsAt: string } | null;
  emptyLegs: TripStopSegment[];
  issues: TripPlanIssue[];
}

/** A crew member with everything both `checkTripCrew` and the board need —
 * the serialized row, the name, and certifications in both the shared
 * `HeldCertification` form (for the check, which needs expiry dates) and the
 * flattened type list the board renders. */
type LoadedCrewMember = TransportPlanningCrewMember & {
  name: string;
  held: ReturnType<typeof toHeldCertifications>;
};

/** The `vehicle` field both `getBoard`'s lanes and `getDetail`'s journey
 * carry — `TRIP_INCLUDE`'s selected columns, reshaped once instead of
 * inline at each call site. */
function vehicleSummary(row: TripDetailRow): TransportPlanningLane['vehicle'] {
  return {
    id: row.vehicleId,
    licensePlate: row.vehicle.licensePlate,
    numeroCauda: row.vehicle.numeroCauda,
    vehicleType: row.vehicle.vehicleType as never,
    seatedCapacity: row.vehicle.seatedCapacity,
    wheelchairPositions: row.vehicle.wheelchairPositions,
    stretcherPositions: row.vehicle.stretcherPositions,
  };
}

/**
 * The 1-based ordinal `TransportPlanningLane.journeyNumber` carries, one
 * vehicle's trips at a time — earliest first stop first, same as
 * `groupLanesByVehicle`/`VehicleGroup` order the lanes for display on the
 * frontend board. Computed here, once, so `getDetail`'s single-trip journey
 * page (which has no sibling trip loaded to sort against) lands on the same
 * number as the board does for the same trip, rather than a second,
 * independent implementation of this sort drifting from this one.
 */
function journeyNumbersByTripId(rows: { id: string; stops: { plannedAt: Date }[] }[]): Map<string, number> {
  const firstStopAt = (row: { stops: { plannedAt: Date }[] }) =>
    row.stops.length ? Math.min(...row.stops.map((s) => s.plannedAt.getTime())) : Number.MAX_SAFE_INTEGER;
  const ordered = [...rows].sort((a, b) => firstStopAt(a) - firstStopAt(b));
  return new Map(ordered.map((row, index) => [row.id, index + 1]));
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
  private readonly logger = new Logger(TripsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly delegationSettings: DelegationSettingsService,
    private readonly staffAbsences: StaffAbsencesService,
    private readonly vehicleOccupancy: VehicleOccupancyService,
    private readonly transportRequestLegs: TransportRequestLegsService,
    private readonly patients: PatientsService,
    private readonly legTravel: TripLegTravelService,
    @Inject(ROUTING_SERVICE) private readonly routing: RoutingService,
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

  /**
   * One journey's own page (#247 stage 3) — the same ranked validation the
   * board computes for this trip, plus what a standalone page needs and the
   * board gets for free by being loaded alongside every other lane: the
   * vehicle, this journey's `journeyNumber` (via a small sibling query — the
   * one extra round trip a single-trip page can't avoid) and `legsById` for
   * its own stops.
   */
  async getDetail(id: string, user: RequestUser): Promise<TripJourneyDetail> {
    const row = await this.prisma.trip.findUnique({ where: { id }, include: TRIP_INCLUDE });
    if (!row) throw new NotFoundException(`Trip ${id} not found`);
    const detail = await this.buildDetail(row);

    const siblings = await this.prisma.trip.findMany({
      where: { vehicleId: row.vehicleId, date: row.date },
      select: { id: true, stops: { select: { plannedAt: true } } },
    });
    const journeyNumber = journeyNumbersByTripId(siblings).get(row.id) ?? 1;

    const legIds = [
      ...new Set((row.stops as TripStopRow[]).map((stop) => stop.transportLegId).filter((legId): legId is string => !!legId)),
    ];
    const legs = await this.transportRequestLegs.findByIds(legIds);
    const legsById = await this.loadLegsById(legs, user);

    const lane = await this.attachRouteGeometry(
      { ...detail, journeyNumber, vehicle: vehicleSummary(row) },
      legsById,
    );
    return { ...lane, legsById };
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

    // Per vehicle, not across the whole date — see `journeyNumbersByTripId`.
    const journeyNumberByTripId = new Map<string, number>();
    const rowsByVehicle = new Map<string, typeof rows>();
    for (const row of rows) rowsByVehicle.set(row.vehicleId, [...(rowsByVehicle.get(row.vehicleId) ?? []), row]);
    for (const vehicleRows of rowsByVehicle.values()) {
      for (const [tripId, number] of journeyNumbersByTripId(vehicleRows)) journeyNumberByTripId.set(tripId, number);
    }

    const lanes: Array<Omit<TransportPlanningLane, 'routeGeometry'>> = await Promise.all(
      rows.map(async (row) => ({
        ...(await this.buildDetail(row)),
        journeyNumber: journeyNumberByTripId.get(row.id) ?? 1,
        vehicle: vehicleSummary(row),
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
    const legsById = await this.loadLegsById([...assignedLegs, ...unassignedLegs], user);

    const lanesWithGeometry = await Promise.all(
      lanes.map((lane) => this.attachRouteGeometry(lane, legsById)),
    );

    return {
      date,
      lanes: lanesWithGeometry,
      legsById,
      unassignedLegIds: unassignedLegs.map((leg) => leg.id),
    };
  }

  /**
   * One vehicle's whole day (#247 stage 5) — the vehicle-day page's one
   * call, reached from the board by clicking a vehicle's own icon. Same
   * per-lane computation `getBoard` does, scoped to a single vehicle via the
   * `vehicleId` filter `list` already supports, rather than the whole
   * fleet. A vehicle with nothing planned that date returns empty `lanes`
   * rather than 404ing — only an unknown `vehicleId` is a 404, resolved via
   * a `Vehicle` lookup since there is no trip row to read it off in that
   * case.
   */
  async getVehicleDay(vehicleId: string, date: string, user: RequestUser): Promise<VehicleDayJourneys> {
    const rows = await this.prisma.trip.findMany({
      where: { vehicleId, date: parseIsoDate(date) },
      include: TRIP_INCLUDE,
      orderBy: [{ createdAt: 'asc' }],
    });

    if (rows.length === 0) {
      const vehicle = await this.prisma.vehicle.findUnique({
        where: { id: vehicleId },
        select: {
          id: true,
          licensePlate: true,
          numeroCauda: true,
          vehicleType: true,
          seatedCapacity: true,
          wheelchairPositions: true,
          stretcherPositions: true,
        },
      });
      if (!vehicle) throw new NotFoundException(`Vehicle ${vehicleId} not found`);
      return { date, vehicle: { ...vehicle, vehicleType: vehicle.vehicleType as never }, lanes: [], legsById: {} };
    }

    const journeyNumberByTripId = journeyNumbersByTripId(rows);
    const lanes: Array<Omit<TransportPlanningLane, 'routeGeometry'>> = await Promise.all(
      rows.map(async (row) => ({
        ...(await this.buildDetail(row)),
        journeyNumber: journeyNumberByTripId.get(row.id) ?? 1,
        vehicle: vehicleSummary(row),
      })),
    );

    const legIds = [
      ...new Set(rows.flatMap((row) => (row.stops as TripStopRow[]).map((stop) => stop.transportLegId).filter((id): id is string => !!id))),
    ];
    const legs = await this.transportRequestLegs.findByIds(legIds);
    const legsById = await this.loadLegsById(legs, user);
    const lanesWithGeometry = await Promise.all(lanes.map((lane) => this.attachRouteGeometry(lane, legsById)));

    return { date, vehicle: vehicleSummary(rows[0]), lanes: lanesWithGeometry, legsById };
  }

  /**
   * This journey's road path, one continuous line through every stop in
   * plan order (#247 stage 4's map panel). Deliberately one line for the
   * whole trip rather than one dashed segment per leg direction: OSRM's
   * `/route` returns a single geometry for the sequence it's given, and
   * splitting it back into per-leg direction segments would mean one OSRM
   * call per leg instead of one per journey — for a corridor-overlap map,
   * a milk-run's full path is the thing worth drawing; direction already
   * reads off the numbered stop markers and the timeline/inspector next to
   * it. A `PICKUP`/`DROPOFF` stop takes its point from the leg's own
   * resolved `door` (its own coordinates rarely carry one, see
   * `TripLegTravelService`'s doc comment); `WAIT`/`RETURN_TO_BASE`/`DEPART_FROM_BASE` already
   * carry their own resolved point (`TripStopsService` copies it from the
   * facility or the base at creation).
   */
  private async attachRouteGeometry(
    lane: Omit<TransportPlanningLane, 'routeGeometry'>,
    legsById: Record<string, TransportPlanningLeg>,
  ): Promise<TransportPlanningLane> {
    const points: Coordinates[] = [];
    for (const stop of lane.stops) {
      if (stop.kind === TripStopKind.PICKUP || stop.kind === TripStopKind.DROPOFF) {
        const leg = stop.transportLegId ? legsById[stop.transportLegId] : undefined;
        const point = stop.kind === TripStopKind.PICKUP ? leg?.door.origin : leg?.door.destination;
        if (point) points.push(point);
      } else if (stop.latitude != null && stop.longitude != null) {
        points.push({ latitude: stop.latitude, longitude: stop.longitude });
      }
    }

    if (points.length < 2) return { ...lane, routeGeometry: null };

    try {
      const routeGeometry = await this.routing.routeGeometry(points);
      return { ...lane, routeGeometry };
    } catch (cause) {
      // The board is still a usable board without a drawn route — same
      // fail-soft posture as `TripLegTravelService.estimate`.
      this.logger.warn(`Route geometry failed for trip ${lane.trip.id}: ${String(cause)}`);
      return { ...lane, routeGeometry: null };
    }
  }

  /**
   * Every already-loaded `TransportLeg` joined to what a board card (or a
   * journey page's stop table) needs to display it: the patient's id, name
   * (degraded per `VIEW_PATIENT_IDENTITY`, same as `findManyForDisplay`
   * itself) and mobility, and the advisory travel estimate (#219/#247).
   * Shared by `getBoard` (the whole date's legs, assigned and not) and
   * `getDetail` (one trip's own assigned legs only) so the two surfaces
   * never compute a leg's facts two different ways.
   */
  private async loadLegsById(legs: TransportLeg[], user: RequestUser): Promise<Record<string, TransportPlanningLeg>> {
    if (legs.length === 0) return {};

    const requestIds = [...new Set(legs.map((leg) => leg.transportRequestId))];
    const requests = await this.prisma.transportRequest.findMany({
      where: { id: { in: requestIds } },
      select: { id: true, patientId: true },
    });
    const patientIdByRequestId = new Map(requests.map((r) => [r.id, r.patientId]));
    const patientIds = [...new Set([...patientIdByRequestId.values()])];
    const patientDisplay = await this.patients.findManyForDisplay(patientIds, user);

    // The pickup and home-arrival times the crew infers by experience today
    // (#219) — advisory only, and never allowed to fail the board: see
    // `TripLegTravelService`.
    const travel = await this.legTravel.estimateMany(
      legs,
      new Map(
        legs.map((leg) => {
          const patient = patientDisplay.get(patientIdByRequestId.get(leg.transportRequestId) ?? '');
          return [
            leg.id,
            {
              localityId: patient?.localityId ?? null,
              latitude: patient?.latitude ?? null,
              longitude: patient?.longitude ?? null,
            },
          ];
        }),
      ),
      await this.delegationSettings.get(),
    );

    const legsById: Record<string, TransportPlanningLeg> = {};
    for (const leg of legs) {
      const patientId = patientIdByRequestId.get(leg.transportRequestId) ?? '';
      const display = patientDisplay.get(patientId);
      const estimate = travel.get(leg.id);
      legsById[leg.id] = {
        ...leg,
        patientId,
        patientMobility: display?.mobility ?? PatientMobility.AMBULATORY,
        ...(display?.fullName ? { patientName: display.fullName } : {}),
        travelMinutes: estimate?.travelMinutes ?? null,
        travelEstimated: estimate?.travelEstimated ?? false,
        travelDistanceMeters: estimate?.travelDistanceMeters ?? null,
        suggested: estimate?.suggested ?? { pickupAt: null, dropoffAt: null },
        door: estimate?.door ?? { origin: null, destination: null },
      };
    }
    return legsById;
  }

  private async buildDetail(row: TripDetailRow): Promise<TripDetail> {
    const stops = row.stops as TripStopRow[];
    const date = toIsoDate(row.date);
    const [passengerRequirements, absences, occupancyConflicts, crew] = await Promise.all([
      loadPassengerRequirements(this.prisma, pickupLegIds(stops)),
      this.staffAbsences.findOverlapping(date, date),
      this.checkVehicleAvailability(row.id, row.vehicleId, stops),
      this.loadCrew(row.crewMembers, date),
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
    const crewRequirement = tripCrewRequirement(carriesStretcherPassenger(segments));

    const issues: TripPlanIssue[] = [
      ...checkTripCapacity(segments, row.vehicle),
      ...occupancyConflicts,
      ...this.checkCrewAvailability(crew, absentUserIds(absences)),
      ...checkTripCrew({
        crew: crew.map((member) => ({ userId: member.userId, certifications: member.held })),
        requirement: crewRequirement,
        vehicleType: row.vehicle.vehicleType as VehicleType,
        date,
        // A lane with nothing aboard yet has no crew to fall short of — see
        // `checkTripCrew`. `WAIT`/`RETURN_TO_BASE`/`DEPART_FROM_BASE`-only trips count as empty.
        hasPassengers: segments.some((segment) => segment.onboardLegIds.length > 0),
      }),
      ...(await this.checkArrivalTiming(stops)),
    ];

    return {
      trip: serializeTrip(row as TripRow),
      crewMembers: crew.map(({ name: _name, held: _held, ...member }) => member),
      crewRequirement,
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

  /**
   * The crew rows joined to the people they name, with certifications resolved
   * against the **trip's own date** rather than today — planning three weeks
   * out must not accept a certificate that expires next Tuesday, and reading
   * back a past trip must not retro-fail a crew whose certificate has lapsed
   * since. One query for the whole crew, never one per member.
   */
  private async loadCrew(
    crewMembers: TripDetailRow['crewMembers'],
    date: string,
  ): Promise<LoadedCrewMember[]> {
    if (crewMembers.length === 0) return [];
    const users = await this.prisma.user.findMany({
      where: { id: { in: crewMembers.map((member) => member.userId) } },
      select: { id: true, firstName: true, lastName: true, certifications: { select: CERT_HELD_SELECT } },
    });
    const userById = new Map(users.map((user) => [user.id, user]));

    return crewMembers.map((member) => {
      const user = userById.get(member.userId);
      const held = toHeldCertifications(user?.certifications ?? []);
      return {
        ...serializeTripCrewMember(member),
        firstName: user?.firstName ?? '',
        lastName: user?.lastName ?? '',
        // Falls back to the id so a message about a user deleted since never
        // reads as being about nobody at all.
        name: user ? `${user.firstName} ${user.lastName}`.trim() : member.userId,
        held,
        certifications: effectiveCertifications(held, date)
          .filter((cert) => cert.status !== 'EXPIRED')
          .map((cert) => cert.type),
      };
    });
  }

  private checkCrewAvailability(
    crewMembers: LoadedCrewMember[],
    absentUserIds: Set<string>,
  ): TripPlanIssue[] {
    return crewMembers
      .filter((member) => !member.overrideReason && absentUserIds.has(member.userId))
      .map((member) => ({
        level: 'ERROR' as const,
        code: 'CREW_UNAVAILABLE',
        message: `${member.name} is recorded absent on this trip's date.`,
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
