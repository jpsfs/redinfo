import { Injectable } from '@nestjs/common';
import { CrewManifestStop, CrewManifestTrip, MyTransportTripsResponse } from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { parseIsoDate } from '../utils/date.util';
import { TransportRequestLegsService } from '../transport-requests/transport-request-legs.service';
import { PatientsService } from '../patients/patients.service';
import { TripRow, TripStopRow, serializeTrip, serializeTripStop } from './trip.serializer';

/**
 * `GET /trips/me?date=` (#236) — a crew member's own trips for a date: the
 * artefact a driver actually works from. Self-scoped like
 * `SchedulesService.getMyDuties`: filters to trips where the caller is a
 * `TripCrewMember` before touching anything else, so this is safe to leave
 * ungated on the controller (see `TripsController.getMyTrips`) — nobody can
 * widen the query to another crew member's day.
 *
 * Deliberately its own service rather than a method on `TripsService`: that
 * service's `buildDetail` computes the planner's ranked validation (capacity,
 * availability, arrival timing) a crew member reading their own manifest has
 * no use for and no ability to act on — this only ever enriches stops for
 * display.
 */
@Injectable()
export class TripCrewManifestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transportRequestLegs: TransportRequestLegsService,
    private readonly patients: PatientsService,
  ) {}

  async getMyTrips(userId: string, date: string): Promise<MyTransportTripsResponse> {
    const rows = await this.prisma.trip.findMany({
      where: { date: parseIsoDate(date), crewMembers: { some: { userId } } },
      include: {
        vehicle: { select: { licensePlate: true, numeroCauda: true, vehicleType: true } },
        stops: {
          orderBy: { sequence: 'asc' },
          include: { facility: { select: { name: true } } },
        },
      },
      orderBy: [{ createdAt: 'asc' }],
    });
    if (rows.length === 0) return { date, trips: [] };

    const legIds = [
      ...new Set(
        rows.flatMap((row) => row.stops.map((stop) => stop.transportLegId).filter((id): id is string => !!id)),
      ),
    ];
    const legs = await this.transportRequestLegs.findByIds(legIds);
    const legById = new Map(legs.map((leg) => [leg.id, leg]));

    const requestIds = [...new Set(legs.map((leg) => leg.transportRequestId))];
    const requests = await this.prisma.transportRequest.findMany({
      where: { id: { in: requestIds } },
      select: { id: true, patientId: true, appointmentAt: true },
    });
    const requestById = new Map(requests.map((request) => [request.id, request]));
    const patientIds = [...new Set(requests.map((request) => request.patientId))];
    const patientDisplay = await this.patients.findManyForCrewManifest(patientIds);

    const trips: CrewManifestTrip[] = rows.map((row) => ({
      trip: serializeTrip(row as TripRow),
      vehicle: {
        id: row.vehicleId,
        licensePlate: row.vehicle.licensePlate,
        numeroCauda: row.vehicle.numeroCauda,
        vehicleType: row.vehicle.vehicleType as never,
      },
      stops: (row.stops as (TripStopRow & { facility: { name: string } | null })[]).map((stop) =>
        this.buildStop(stop, legById, requestById, patientDisplay),
      ),
    }));

    return { date, trips };
  }

  private buildStop(
    stop: TripStopRow & { facility: { name: string } | null },
    legById: Map<string, Awaited<ReturnType<TransportRequestLegsService['findByIds']>>[number]>,
    requestById: Map<string, { id: string; patientId: string; appointmentAt: Date }>,
    patientDisplay: Awaited<ReturnType<PatientsService['findManyForCrewManifest']>>,
  ): CrewManifestStop {
    const leg = stop.transportLegId ? legById.get(stop.transportLegId) : undefined;
    const request = leg ? requestById.get(leg.transportRequestId) : undefined;
    const patient = request ? patientDisplay.get(request.patientId) : undefined;

    return {
      ...serializeTripStop(stop),
      facilityName: stop.facility?.name ?? null,
      legDirection: leg?.direction ?? null,
      patientId: request?.patientId ?? null,
      patientName: patient?.fullName ?? null,
      patientMobility: patient?.mobility ?? null,
      appointmentAt: request?.appointmentAt.toISOString() ?? null,
      treatmentEndAt: leg?.effectiveEstimatedEndAt ?? null,
    };
  }
}
