import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  LegDirection,
  LegStatus,
  PassengerCapacityRequirement,
  PlacementBlockReason,
  RankedPlacement,
  TransportLeg,
  TripStopKind,
  TripStopWalkInput,
  VehicleOccupancySource,
  checkTripCapacity,
  walkTripStops,
} from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { Coordinates, ROUTING_SERVICE, RoutingMatrixCell, RoutingService } from '../routing/routing.interface';
import { VehicleOccupancyService } from '../vehicle-occupancy/vehicle-occupancy.service';
import { DelegationSettingsService } from '../live-runs/delegation-settings.service';
import { PatientsService, RequestUser } from '../patients/patients.service';
import { TransportRequestLegsService } from '../transport-requests/transport-request-legs.service';
import { parseIsoDate } from '../utils/date.util';
import { TripStopRow, toWalkInput } from './trip.serializer';
import { loadPassengerRequirements, pickupLegIds } from './trip-passenger-requirements.util';
import { TripLegTravelService, LegPatientContext } from './trip-leg-travel.service';
import { journeyNumbersByTripId } from './trips.service';

const NO_DEMAND: PassengerCapacityRequirement = { wheelchairPositions: 0, seats: 0, stretcherPositions: 0 };

function addDemand(a: PassengerCapacityRequirement, b?: PassengerCapacityRequirement): PassengerCapacityRequirement {
  if (!b) return a;
  return {
    wheelchairPositions: a.wheelchairPositions + b.wheelchairPositions,
    seats: a.seats + b.seats,
    stretcherPositions: a.stretcherPositions + b.stretcherPositions,
  };
}

/** The rough middle of a group's several homes — good enough for ranking
 * where to send the vehicle, never shown as a precise point. `null` when
 * every leg's own door is unresolvable, same fail-soft posture as a leg's
 * own `travelMinutes`. */
export function centroid(points: (Coordinates | null | undefined)[]): Coordinates | null {
  const known = points.filter((p): p is Coordinates => !!p);
  if (known.length === 0) return null;
  return {
    latitude: known.reduce((sum, p) => sum + p.latitude, 0) / known.length,
    longitude: known.reduce((sum, p) => sum + p.longitude, 0) / known.length,
  };
}

const CAPACITY_BLOCK_REASON: Record<string, PlacementBlockReason> = {
  OVER_CAPACITY_SEATS: 'CAPACITY_SEATS',
  OVER_CAPACITY_WHEELCHAIR: 'CAPACITY_WHEELCHAIR',
  OVER_CAPACITY_STRETCHER: 'CAPACITY_STRETCHER',
};

/** Feasible candidates first, cheapest first; blocked candidates last (still
 * present — see `RankedPlacement`'s own doc comment), cheapest-among-them
 * first so a planner scanning down the list sees the least-bad blocked
 * option before the worst one. */
export function compareCandidates(a: RankedPlacement, b: RankedPlacement): number {
  if (a.blockedBy.length !== b.blockedBy.length) return a.blockedBy.length - b.blockedBy.length;
  const aCost = a.deltaKm ?? Number.POSITIVE_INFINITY;
  const bCost = b.deltaKm ?? Number.POSITIVE_INFINITY;
  return aCost - bCost;
}

interface StopPoint {
  point: Coordinates | null;
  at: string;
}

/** A coordinate resolved from an OSRM cell, plus a duration to go with it —
 * `null` only when the endpoint itself couldn't be resolved to a point at
 * all, never merely because OSRM fell back to a straight line (that's
 * `estimated`, surfaced the same fail-soft way `travelMinutes` is elsewhere,
 * not a reason to block a candidate). */
interface RoutedEdge {
  distanceMeters: number;
  durationSeconds: number;
}

function edge(cell: RoutingMatrixCell | undefined): RoutedEdge | null {
  return cell ? { distanceMeters: cell.distanceMeters, durationSeconds: cell.durationSeconds } : null;
}

function pointKey(point: Coordinates): string {
  return `${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}`;
}

/**
 * Ranks every vehicle/journey a group of unplanned legs could go onto
 * (`POST /trips/suggest-placements`, the redesign's Suggestions stage —
 * `docs/plans/planeamento-transportes-redesign.md` §6/§8). Ranking only:
 * nothing here writes anything, and a candidate that fails a hard
 * constraint is still returned with its `blockedBy` filled in rather than
 * dropped — the planner needs to know the option was considered (#219's
 * deferral of automatic optimisation stands).
 *
 * Deliberately scoped to the two ends of an existing journey's stop
 * sequence — prepend before its first stop, append after its last — rather
 * than every gap in between. Capacity and vehicle-availability are
 * time-based (`walkTripStops` sorts by `plannedAt`, not manifest order), so
 * they come out identical whichever end is cheaper to route through; only
 * the detour cost differs, which is exactly what decides between the two.
 * A full middle-of-the-route search would multiply the routing calls for a
 * benefit this "ranking, not optimisation" story doesn't ask for.
 */
@Injectable()
export class TripPlacementSuggestionsService {
  private readonly logger = new Logger(TripPlacementSuggestionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly transportRequestLegs: TransportRequestLegsService,
    private readonly patients: PatientsService,
    private readonly delegationSettings: DelegationSettingsService,
    private readonly legTravel: TripLegTravelService,
    private readonly vehicleOccupancy: VehicleOccupancyService,
    @Inject(ROUTING_SERVICE) private readonly routing: RoutingService,
  ) {}

  async suggest(legIds: string[], user: RequestUser): Promise<RankedPlacement[]> {
    const legs = await this.transportRequestLegs.findByIds(legIds);
    if (legs.length !== legIds.length) throw new NotFoundException('One or more legs could not be found.');
    for (const leg of legs) {
      if (leg.status === LegStatus.CANCELLED || leg.status === LegStatus.NO_SHOW || leg.status === LegStatus.COMPLETED) {
        throw new ConflictException(`A ${leg.status.toLowerCase()} leg cannot be placed.`);
      }
    }
    const dates = new Set(legs.map((leg) => leg.date));
    if (dates.size > 1) throw new BadRequestException('Every leg in the group must share the same date.');
    const alreadyAssigned = await this.prisma.tripStop.count({ where: { transportLegId: { in: legIds } } });
    if (alreadyAssigned > 0) throw new ConflictException('One or more legs are already assigned to a trip.');

    const date = legs[0].date;
    const direction = legs[0].direction;
    const thresholds = await this.delegationSettings.get();

    const [groupDoors, passengerRequirements, vehicles, trips] = await Promise.all([
      this.resolveDoors(legs, user, thresholds),
      loadPassengerRequirements(this.prisma, legIds),
      this.prisma.vehicle.findMany({
        where: { isDeleted: false },
        select: {
          id: true,
          licensePlate: true,
          numeroCauda: true,
          seatedCapacity: true,
          wheelchairPositions: true,
          stretcherPositions: true,
        },
      }),
      this.prisma.trip.findMany({
        where: { date: parseIsoDate(date) },
        include: { stops: { orderBy: { sequence: 'asc' } } },
      }),
    ]);

    const pickupPoint = centroid(legs.map((leg) => groupDoors.get(leg.id)?.origin ?? null));
    const dropoffPoint = centroid(legs.map((leg) => groupDoors.get(leg.id)?.destination ?? null));

    const groupStubs: TripStopWalkInput[] = legs.flatMap((leg) => {
      const doors = groupDoors.get(leg.id);
      const pickupAt = doors?.suggestedPickupAt ?? leg.appointmentAt;
      const dropoffAt = doors?.suggestedDropoffAt ?? leg.effectiveEstimatedEndAt;
      return [
        {
          id: `suggest-pickup-${leg.id}`,
          sequence: 0,
          kind: TripStopKind.PICKUP,
          transportLegId: leg.id,
          plannedAt: pickupAt,
          passengerRequirement: passengerRequirements.get(leg.id),
        },
        { id: `suggest-dropoff-${leg.id}`, sequence: 0, kind: TripStopKind.DROPOFF, transportLegId: leg.id, plannedAt: dropoffAt },
      ];
    });
    const groupTimes = groupStubs.map((s) => new Date(s.plannedAt).getTime());
    const groupWindow = { startsAt: new Date(Math.min(...groupTimes)), endsAt: new Date(Math.max(...groupTimes)) };

    // Existing trips reference legs of their own — resolved the same way as
    // the group's, batched once for the whole date rather than per trip.
    const existingLegIds = [
      ...new Set(
        trips.flatMap((trip) =>
          (trip.stops as TripStopRow[])
            .filter((stop) => stop.kind === TripStopKind.PICKUP || stop.kind === TripStopKind.DROPOFF)
            .map((stop) => stop.transportLegId)
            .filter((id): id is string => !!id),
        ),
      ),
    ];
    const existingLegs = await this.transportRequestLegs.findByIds(existingLegIds);
    const existingDoors = await this.resolveDoors(existingLegs, user, thresholds);

    const stopPoint = (stop: TripStopRow): Coordinates | null => {
      if (stop.kind === TripStopKind.PICKUP || stop.kind === TripStopKind.DROPOFF) {
        const door = stop.transportLegId ? existingDoors.get(stop.transportLegId) : undefined;
        return (stop.kind === TripStopKind.PICKUP ? door?.origin : door?.destination) ?? null;
      }
      return stop.latitude != null && stop.longitude != null ? { latitude: stop.latitude, longitude: stop.longitude } : null;
    };

    const tripsByVehicle = new Map<string, typeof trips>();
    for (const trip of trips) tripsByVehicle.set(trip.vehicleId, [...(tripsByVehicle.get(trip.vehicleId) ?? []), trip]);
    const journeyNumberByTripId = new Map<string, number>();
    for (const vehicleTrips of tripsByVehicle.values()) {
      for (const [id, number] of journeyNumbersByTripId(vehicleTrips)) journeyNumberByTripId.set(id, number);
    }

    // One matrix call for the whole request: every trip's first/last stop
    // point, plus the group's own pickup/dropoff, batched together the same
    // way `RoutingService.distanceMatrix`'s own doc comment describes — an
    // OSRM `/table` call costs the same whether it carries two points or
    // forty, so batching here is what keeps this an interactive action
    // instead of one HTTP round trip per candidate.
    const edgePoints: Coordinates[] = [];
    const edgeIndex = new Map<string, number>();
    const addPoint = (point: Coordinates | null): number | null => {
      if (!point) return null;
      const key = pointKey(point);
      const existing = edgeIndex.get(key);
      if (existing !== undefined) return existing;
      const index = edgePoints.length;
      edgePoints.push(point);
      edgeIndex.set(key, index);
      return index;
    };
    const pickupIndex = addPoint(pickupPoint);
    const dropoffIndex = addPoint(dropoffPoint);
    const boundary = new Map<string, { firstIndex: number | null; lastIndex: number | null }>();
    for (const trip of trips) {
      const stops = [...(trip.stops as TripStopRow[])].sort(
        (a, b) => a.plannedAt.getTime() - b.plannedAt.getTime(),
      );
      const first = stops[0] ? stopPoint(stops[0]) : null;
      const last = stops[stops.length - 1] ? stopPoint(stops[stops.length - 1]) : null;
      boundary.set(trip.id, { firstIndex: addPoint(first), lastIndex: addPoint(last) });
    }

    const matrix = edgePoints.length > 0 ? await this.safeMatrix(edgePoints, edgePoints) : [];
    const cellBetween = (fromIndex: number | null, toIndex: number | null): RoutedEdge | null =>
      fromIndex === null || toIndex === null ? null : edge(matrix[fromIndex]?.[toIndex]);
    const pickupToDropoff = cellBetween(pickupIndex, dropoffIndex);

    // Vehicle-availability conflicts for the whole date, loaded once — a
    // fresh trip on an otherwise-idle vehicle can still collide with
    // maintenance or a shift commitment `VehicleOccupancy` already knows
    // about, same hard-but-overridable constraint `TripStopsService.
    // syncOccupancy` enforces at write time.
    const dayStart = parseIsoDate(date);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const occupancies = await this.vehicleOccupancy.findInRange(dayStart, dayEnd);
    const occupanciesByVehicle = new Map<string, typeof occupancies>();
    for (const occ of occupancies) occupanciesByVehicle.set(occ.vehicleId, [...(occupanciesByVehicle.get(occ.vehicleId) ?? []), occ]);

    const candidates: RankedPlacement[] = [];
    for (const vehicle of vehicles) {
      const vehicleTrips = tripsByVehicle.get(vehicle.id) ?? [];
      for (const trip of vehicleTrips) {
        candidates.push(
          await this.rankCandidate({
            vehicle,
            tripId: trip.id,
            journeyNumber: journeyNumberByTripId.get(trip.id) ?? 1,
            existingStops: trip.stops as TripStopRow[],
            groupStubs,
            groupWindow,
            pickupToDropoff,
            neighbourEdge: boundary.get(trip.id) ?? { firstIndex: null, lastIndex: null },
            cellBetween,
            pickupIndex,
            dropoffIndex,
            occupancies: occupanciesByVehicle.get(vehicle.id) ?? [],
            occupancyExcludeSourceId: trip.id,
            direction,
            appointmentAt: legs[0].appointmentAt,
            pickupPoint,
            dropoffPoint,
          }),
        );
      }
      candidates.push(
        await this.rankCandidate({
          vehicle,
          tripId: null,
          journeyNumber: null,
          existingStops: [],
          groupStubs,
          groupWindow,
          pickupToDropoff,
          neighbourEdge: { firstIndex: null, lastIndex: null },
          cellBetween,
          pickupIndex,
          dropoffIndex,
          occupancies: occupanciesByVehicle.get(vehicle.id) ?? [],
          occupancyExcludeSourceId: null,
          direction,
          appointmentAt: legs[0].appointmentAt,
          pickupPoint,
          dropoffPoint,
        }),
      );
    }

    return candidates.sort(compareCandidates);
  }

  private async rankCandidate(input: {
    vehicle: { id: string; licensePlate: string; numeroCauda: string; seatedCapacity: number; wheelchairPositions: number; stretcherPositions: number };
    tripId: string | null;
    journeyNumber: number | null;
    existingStops: TripStopRow[];
    groupStubs: TripStopWalkInput[];
    groupWindow: { startsAt: Date; endsAt: Date };
    pickupToDropoff: RoutedEdge | null;
    neighbourEdge: { firstIndex: number | null; lastIndex: number | null };
    cellBetween: (fromIndex: number | null, toIndex: number | null) => RoutedEdge | null;
    pickupIndex: number | null;
    dropoffIndex: number | null;
    occupancies: { startsAt: Date; endsAt: Date; source: string; sourceId: string }[];
    occupancyExcludeSourceId: string | null;
    direction: LegDirection;
    appointmentAt: string;
    pickupPoint: Coordinates | null;
    dropoffPoint: Coordinates | null;
  }): Promise<RankedPlacement> {
    const blockedBy: PlacementBlockReason[] = [];
    if (!input.pickupPoint || !input.dropoffPoint) blockedBy.push('ROUTE_UNKNOWN');

    // Capacity is time-based, not manifest-order, so it's identical for
    // either end of the sequence — see the class's own doc comment.
    const existingWalkInputs = input.existingStops.map((s) => toWalkInput(s));
    const passengerRequirements = await loadPassengerRequirements(this.prisma, pickupLegIds(existingWalkInputs));
    for (const walkInput of existingWalkInputs) {
      if (walkInput.kind === TripStopKind.PICKUP && walkInput.transportLegId) {
        walkInput.passengerRequirement = passengerRequirements.get(walkInput.transportLegId);
      }
    }
    const capacityIssues = checkTripCapacity(
      walkTripStops([...existingWalkInputs, ...input.groupStubs]),
      input.vehicle,
    );
    for (const issue of capacityIssues) {
      const reason = CAPACITY_BLOCK_REASON[issue.code];
      if (reason && !blockedBy.includes(reason)) blockedBy.push(reason);
    }

    const existingTimes = input.existingStops.map((s) => s.plannedAt.getTime());
    const mergedStart = existingTimes.length ? new Date(Math.min(...existingTimes, input.groupWindow.startsAt.getTime())) : input.groupWindow.startsAt;
    const mergedEnd = existingTimes.length ? new Date(Math.max(...existingTimes, input.groupWindow.endsAt.getTime())) : input.groupWindow.endsAt;
    const conflicts = input.occupancies.some(
      (occ) =>
        occ.startsAt < mergedEnd &&
        occ.endsAt > mergedStart &&
        !(occ.source === VehicleOccupancySource.TRANSPORT_TRIP && occ.sourceId === input.occupancyExcludeSourceId),
    );
    if (conflicts) blockedBy.push('VEHICLE_UNAVAILABLE');

    // Prepend before the first stop (or the whole cost, for a fresh trip
    // with none) vs. append after the last — whichever costs less to route.
    const prependEdge = input.cellBetween(input.dropoffIndex, input.neighbourEdge.firstIndex);
    const appendEdge = input.cellBetween(input.neighbourEdge.lastIndex, input.pickupIndex);
    const prependCost = (prependEdge?.distanceMeters ?? 0) + (input.pickupToDropoff?.distanceMeters ?? 0);
    const appendCost = (appendEdge?.distanceMeters ?? 0) + (input.pickupToDropoff?.distanceMeters ?? 0);
    const useAppend = input.existingStops.length > 0 && appendCost <= prependCost;

    const distanceMeters =
      (useAppend ? appendEdge?.distanceMeters ?? 0 : prependEdge?.distanceMeters ?? 0) +
      (input.pickupToDropoff?.distanceMeters ?? 0);
    const durationSeconds =
      (useAppend ? appendEdge?.durationSeconds ?? 0 : prependEdge?.durationSeconds ?? 0) +
      (input.pickupToDropoff?.durationSeconds ?? 0);
    const insertPosition = useAppend ? input.existingStops.length : 0;

    const hasRoute = input.pickupToDropoff !== null || (input.pickupPoint && input.dropoffPoint);
    const deltaKm = hasRoute ? Math.round((distanceMeters / 1000) * 10) / 10 : null;
    const deltaMinutes = hasRoute ? Math.round(durationSeconds / 60) : null;

    let arrivalMarginMinutes: number | null = null;
    if (input.direction === LegDirection.OUTBOUND && input.pickupToDropoff) {
      const priorStopAt = useAppend
        ? input.existingStops.length
          ? Math.max(...input.existingStops.map((s) => s.plannedAt.getTime()))
          : null
        : null;
      const leadingEdgeSeconds = useAppend ? appendEdge?.durationSeconds ?? 0 : 0;
      const etaAtPickup = priorStopAt !== null ? priorStopAt + leadingEdgeSeconds * 1000 : Math.min(...input.groupStubs.filter((s) => s.kind === TripStopKind.PICKUP).map((s) => new Date(s.plannedAt).getTime()));
      const etaAtDropoff = etaAtPickup + input.pickupToDropoff.durationSeconds * 1000;
      arrivalMarginMinutes = Math.round((new Date(input.appointmentAt).getTime() - etaAtDropoff) / 60_000);
    }

    return {
      vehicle: { id: input.vehicle.id, numeroCauda: input.vehicle.numeroCauda, licensePlate: input.vehicle.licensePlate },
      tripId: input.tripId,
      journeyNumber: input.journeyNumber,
      insertPosition,
      deltaKm,
      deltaMinutes,
      arrivalMarginMinutes,
      blockedBy,
    };
  }

  /** `RoutingService.distanceMatrix`, fail-soft — a routing outage costs
   * every candidate its cost figures (`deltaKm`/`deltaMinutes` fall back to
   * `null` in the caller), never the whole suggestions list. */
  private async safeMatrix(origins: Coordinates[], destinations: Coordinates[]): Promise<RoutingMatrixCell[][]> {
    try {
      return await this.routing.distanceMatrix(origins, destinations);
    } catch (cause) {
      this.logger.warn(`Placement-suggestion routing matrix failed: ${String(cause)}`);
      return [];
    }
  }

  /** Door coordinates and advisory pickup/dropoff instants for a set of
   * legs — the same computation `TripsService.loadLegsById` does for the
   * board, reduced to just what ranking needs. */
  private async resolveDoors(
    legs: TransportLeg[],
    user: RequestUser,
    thresholds: Awaited<ReturnType<DelegationSettingsService['get']>>,
  ): Promise<Map<string, { origin: Coordinates | null; destination: Coordinates | null; suggestedPickupAt: string | null; suggestedDropoffAt: string | null }>> {
    if (legs.length === 0) return new Map();
    const requestIds = [...new Set(legs.map((leg) => leg.transportRequestId))];
    const requests = await this.prisma.transportRequest.findMany({
      where: { id: { in: requestIds } },
      select: { id: true, patientId: true },
    });
    const patientIdByRequestId = new Map(requests.map((r) => [r.id, r.patientId]));
    const patientIds = [...new Set([...patientIdByRequestId.values()])];
    const patientDisplay = await this.patients.findManyForDisplay(patientIds, user);

    const patientContext = new Map<string, LegPatientContext>(
      legs.map((leg) => {
        const patient = patientDisplay.get(patientIdByRequestId.get(leg.transportRequestId) ?? '');
        return [leg.id, { localityId: patient?.localityId ?? null, latitude: patient?.latitude ?? null, longitude: patient?.longitude ?? null }];
      }),
    );
    const estimates = await this.legTravel.estimateMany(legs, patientContext, thresholds);

    const result = new Map<
      string,
      { origin: Coordinates | null; destination: Coordinates | null; suggestedPickupAt: string | null; suggestedDropoffAt: string | null }
    >();
    for (const leg of legs) {
      const estimate = estimates.get(leg.id);
      result.set(leg.id, {
        origin: estimate?.door.origin ?? null,
        destination: estimate?.door.destination ?? null,
        suggestedPickupAt: estimate?.suggested.pickupAt ?? null,
        suggestedDropoffAt: estimate?.suggested.dropoffAt ?? null,
      });
    }
    return result;
  }
}
