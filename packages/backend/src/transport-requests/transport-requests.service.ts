import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ScheduleStatus } from '@prisma/client';
import {
  TodayRosterMember,
  TransportRequest,
  TransportRequestAbsentStaff,
  TransportRequestCommittedVehicle,
  TransportRequestDecision,
  TransportRequestFeasibility,
  TransportRequestFreeVehicleGroup,
  TransportRequestVehicleType,
  VehicleOccupancySource,
  VehicleType,
  mapTransportRequestVehicleType,
  validateTransportRequest,
} from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { FacilitiesService } from '../facilities/facilities.service';
import { StaffAbsencesService } from '../staff-absences/staff-absences.service';
import { VehicleOccupancyService } from '../vehicle-occupancy/vehicle-occupancy.service';
import { addIsoDays, parseIsoDate, toIsoDate } from '../utils/date.util';
import { CreateTransportRequestDto } from './dto/create-transport-request.dto';
import { UpdateTransportRequestDto } from './dto/update-transport-request.dto';
import { DecideTransportRequestDto } from './dto/decide-transport-request.dto';
import { TRANSPORT_REQUEST_INCLUDE, TransportRequestRow, serializeTransportRequest } from './transport-request.serializer';

export interface RequestUser {
  id: string;
}

export interface TransportRequestPage {
  data: TransportRequest[];
  total: number;
  page: number;
  perPage: number;
}

/** `normalize`'s return shape — spelled out rather than derived via
 * `ReturnType`, since that method is private and TS won't let a type outside
 * the class reach into it. */
interface NormalizedTransportRequestInput {
  batchReference: string;
  communicatedAt: string;
  requesterAccountCode: string;
  responseDueAt: string;
  externalServiceNumber: string;
  appointmentAt: string;
  requestingOrganisationId: string;
  payingOrganisationId: string;
  agreementId: string | null;
  patientId: string;
  occurrenceType: CreateTransportRequestDto['occurrenceType'];
  requestedVehicleType: CreateTransportRequestDto['requestedVehicleType'];
  escortTravels: boolean;
  isRoundTrip: boolean;
  originAddress: string;
  originLatitude: number | null;
  originLongitude: number | null;
  destinationFacilityId: string | null;
  destinationFacility: CreateTransportRequestDto['destinationFacility'] | null;
  freeTextMessage: string | null;
  coordColumnValue: string | null;
}

/**
 * Non-urgent transport referrals (#228), entered by hand from the source
 * referral — field order mirrors the referral's own layout. Governmental-
 * platform integration is unscoped (#219's spikes); this is the only intake
 * for the foreseeable future.
 *
 * A referral's decision is terminal once made (#229 builds the actual
 * decision page against `decide`) — `update` refuses to touch a decided
 * request, since a plan may already be built against it by then.
 */
@Injectable()
export class TransportRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly facilities: FacilitiesService,
    private readonly staffAbsences: StaffAbsencesService,
    private readonly vehicleOccupancy: VehicleOccupancyService,
  ) {}

  /**
   * `awaitingExternalRegistration` is the decision page's (#229) second,
   * persistent section — accepted but never clicked through on the
   * requester's own platform — and overrides `decision`: there is only one
   * sensible reading of "awaiting external registration" (`ACCEPTED` with no
   * `externallyRegisteredAt`), so a caller passing both gets that, not a
   * silent AND of two filters that could disagree.
   */
  async findManaged(
    page = 1,
    perPage = 50,
    decision?: TransportRequestDecision,
    awaitingExternalRegistration?: boolean,
  ): Promise<TransportRequestPage> {
    const skip = (page - 1) * perPage;
    const where = awaitingExternalRegistration
      ? { decision: TransportRequestDecision.ACCEPTED, externallyRegisteredAt: null }
      : decision
        ? { decision }
        : {};
    // The ageing order the decision page (#229) needs: soonest deadline
    // first for the queue; oldest-accepted-first for the undispatched
    // section, since `responseDueAt` has usually already passed by then.
    const orderBy = awaitingExternalRegistration
      ? ({ decidedAt: 'asc' } as const)
      : ({ responseDueAt: 'asc' } as const);
    const now = new Date();

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.transportRequest.findMany({
        where,
        skip,
        take: perPage,
        orderBy,
        include: TRANSPORT_REQUEST_INCLUDE,
      }),
      this.prisma.transportRequest.count({ where }),
    ]);

    return {
      data: rows.map((row) => serializeTransportRequest(row as TransportRequestRow, now)),
      total,
      page,
      perPage,
    };
  }

  async findOne(id: string): Promise<TransportRequest> {
    const row = await this.prisma.transportRequest.findUnique({
      where: { id },
      include: TRANSPORT_REQUEST_INCLUDE,
    });
    if (!row) throw new NotFoundException(`Transport request ${id} not found`);
    return serializeTransportRequest(row as TransportRequestRow);
  }

  async create(dto: CreateTransportRequestDto, user: RequestUser): Promise<TransportRequest> {
    const input = this.normalize(dto);
    const error = validateTransportRequest(input);
    if (error) throw new BadRequestException(error);

    await this.assertOrganisationHasRole(input.requestingOrganisationId, 'isRequester');
    await this.assertOrganisationHasRole(input.payingOrganisationId, 'isPayer');
    if (input.agreementId) await this.assertAgreementScopedToPayer(input.agreementId, input.payingOrganisationId);
    await this.assertPatientExists(input.patientId);
    await this.assertExternalServiceNumberFree(input.requestingOrganisationId, input.externalServiceNumber);

    const destinationFacilityId = await this.resolveDestinationFacilityId(input);

    const created = await this.prisma.transportRequest.create({
      data: {
        batchReference: input.batchReference,
        communicatedAt: new Date(input.communicatedAt),
        requesterAccountCode: input.requesterAccountCode,
        responseDueAt: new Date(input.responseDueAt),
        externalServiceNumber: input.externalServiceNumber,
        appointmentAt: new Date(input.appointmentAt),
        requestingOrganisationId: input.requestingOrganisationId,
        payingOrganisationId: input.payingOrganisationId,
        agreementId: input.agreementId,
        patientId: input.patientId,
        occurrenceType: input.occurrenceType as never,
        requestedVehicleType: input.requestedVehicleType as never,
        escortTravels: input.escortTravels,
        isRoundTrip: input.isRoundTrip,
        originAddress: input.originAddress,
        originLatitude: input.originLatitude,
        originLongitude: input.originLongitude,
        destinationFacilityId,
        freeTextMessage: input.freeTextMessage,
        coordColumnValue: input.coordColumnValue,
        createdById: user.id,
      } satisfies Prisma.TransportRequestUncheckedCreateInput,
      include: TRANSPORT_REQUEST_INCLUDE,
    });
    return serializeTransportRequest(created as TransportRequestRow);
  }

  async update(id: string, dto: UpdateTransportRequestDto): Promise<TransportRequest> {
    const current = await this.prisma.transportRequest.findUnique({ where: { id } });
    if (!current) throw new NotFoundException(`Transport request ${id} not found`);
    if (current.decision !== TransportRequestDecision.PENDING) {
      throw new ConflictException('A decided referral can no longer be edited.');
    }

    const input = this.normalize({
      batchReference: dto.batchReference ?? current.batchReference,
      communicatedAt: dto.communicatedAt ?? current.communicatedAt.toISOString(),
      requesterAccountCode: dto.requesterAccountCode ?? current.requesterAccountCode,
      responseDueAt: dto.responseDueAt ?? current.responseDueAt.toISOString(),
      externalServiceNumber: dto.externalServiceNumber ?? current.externalServiceNumber,
      appointmentAt: dto.appointmentAt ?? current.appointmentAt.toISOString(),
      requestingOrganisationId: dto.requestingOrganisationId ?? current.requestingOrganisationId,
      payingOrganisationId: dto.payingOrganisationId ?? current.payingOrganisationId,
      agreementId: dto.agreementId !== undefined ? dto.agreementId : current.agreementId,
      patientId: dto.patientId ?? current.patientId,
      occurrenceType: (dto.occurrenceType ?? current.occurrenceType) as never,
      requestedVehicleType: (dto.requestedVehicleType ?? current.requestedVehicleType) as never,
      escortTravels: dto.escortTravels !== undefined ? dto.escortTravels : current.escortTravels,
      isRoundTrip: dto.isRoundTrip !== undefined ? dto.isRoundTrip : current.isRoundTrip,
      originAddress: dto.originAddress ?? current.originAddress,
      originLatitude: dto.originLatitude !== undefined ? dto.originLatitude : current.originLatitude,
      originLongitude: dto.originLongitude !== undefined ? dto.originLongitude : current.originLongitude,
      destinationFacilityId:
        dto.destinationFacilityId !== undefined ? dto.destinationFacilityId : current.destinationFacilityId,
      destinationFacility: dto.destinationFacility,
      freeTextMessage: dto.freeTextMessage !== undefined ? dto.freeTextMessage : current.freeTextMessage,
      coordColumnValue: dto.coordColumnValue !== undefined ? dto.coordColumnValue : current.coordColumnValue,
    });

    const error = validateTransportRequest(input);
    if (error) throw new BadRequestException(error);

    if (input.requestingOrganisationId !== current.requestingOrganisationId) {
      await this.assertOrganisationHasRole(input.requestingOrganisationId, 'isRequester');
    }
    if (input.payingOrganisationId !== current.payingOrganisationId) {
      await this.assertOrganisationHasRole(input.payingOrganisationId, 'isPayer');
    }
    if (input.agreementId) await this.assertAgreementScopedToPayer(input.agreementId, input.payingOrganisationId);
    if (input.patientId !== current.patientId) await this.assertPatientExists(input.patientId);
    if (
      input.requestingOrganisationId !== current.requestingOrganisationId ||
      input.externalServiceNumber !== current.externalServiceNumber
    ) {
      await this.assertExternalServiceNumberFree(input.requestingOrganisationId, input.externalServiceNumber, id);
    }

    const destinationFacilityId =
      dto.destinationFacility || dto.destinationFacilityId !== undefined
        ? await this.resolveDestinationFacilityId(input)
        : current.destinationFacilityId;

    const updated = await this.prisma.transportRequest.update({
      where: { id },
      data: {
        batchReference: input.batchReference,
        communicatedAt: new Date(input.communicatedAt),
        requesterAccountCode: input.requesterAccountCode,
        responseDueAt: new Date(input.responseDueAt),
        externalServiceNumber: input.externalServiceNumber,
        appointmentAt: new Date(input.appointmentAt),
        requestingOrganisationId: input.requestingOrganisationId,
        payingOrganisationId: input.payingOrganisationId,
        agreementId: input.agreementId,
        patientId: input.patientId,
        occurrenceType: input.occurrenceType as never,
        requestedVehicleType: input.requestedVehicleType as never,
        escortTravels: input.escortTravels,
        isRoundTrip: input.isRoundTrip,
        originAddress: input.originAddress,
        originLatitude: input.originLatitude,
        originLongitude: input.originLongitude,
        destinationFacilityId,
        freeTextMessage: input.freeTextMessage,
        coordColumnValue: input.coordColumnValue,
      },
      include: TRANSPORT_REQUEST_INCLUDE,
    });
    return serializeTransportRequest(updated as TransportRequestRow);
  }

  /**
   * Accepts or rejects a referral (#229 builds the page this feeds). Terminal
   * — a request already decided cannot be re-decided.
   *
   * Deliberately never touches `externallyRegisteredAt`: the authoritative
   * accept happens on the requester's own platform, and the two must stay
   * free to silently diverge (AB#228's acceptance criteria).
   */
  async decide(id: string, dto: DecideTransportRequestDto, user: RequestUser): Promise<TransportRequest> {
    const current = await this.prisma.transportRequest.findUnique({ where: { id } });
    if (!current) throw new NotFoundException(`Transport request ${id} not found`);
    if (current.decision !== TransportRequestDecision.PENDING) {
      throw new ConflictException('This referral has already been decided.');
    }

    const rejectionReason = dto.rejectionReason?.trim() || null;
    if (dto.decision === TransportRequestDecision.REJECTED && !rejectionReason) {
      throw new BadRequestException('Give a reason for rejecting the referral.');
    }

    const updated = await this.prisma.transportRequest.update({
      where: { id },
      data: {
        decision: dto.decision as never,
        decidedByUserId: user.id,
        decidedAt: new Date(),
        rejectionReason: dto.decision === TransportRequestDecision.REJECTED ? rejectionReason : null,
      },
      include: TRANSPORT_REQUEST_INCLUDE,
    });
    return serializeTransportRequest(updated as TransportRequestRow);
  }

  /**
   * Stamps `externallyRegisteredAt` — the separate, explicit "registado na
   * plataforma externa" control (#229). Deliberately its own action, never
   * folded into `decide`: accepting in redinfo and registering on the
   * requester's own platform are different facts, made at different times
   * by whoever actually did the clicking there.
   */
  async registerExternally(id: string): Promise<TransportRequest> {
    const current = await this.prisma.transportRequest.findUnique({ where: { id } });
    if (!current) throw new NotFoundException(`Transport request ${id} not found`);
    if (current.decision !== TransportRequestDecision.ACCEPTED) {
      throw new ConflictException('Only an accepted referral can be marked as externally registered.');
    }
    if (current.externallyRegisteredAt) {
      throw new ConflictException('This referral is already marked as externally registered.');
    }

    const updated = await this.prisma.transportRequest.update({
      where: { id },
      data: { externallyRegisteredAt: new Date() },
      include: TRANSPORT_REQUEST_INCLUDE,
    });
    return serializeTransportRequest(updated as TransportRequestRow);
  }

  /**
   * The decision page's (#229) "are we actually free that day?" answer for
   * one referral's appointment date: the published roster, who's on file as
   * absent, and vehicle occupancy — committed and free, by type. Roster
   * comes straight from `Schedule`/`ScheduleAssignment` (no need for
   * `SchedulesService`'s full shift/window reconstruction, just who's on
   * the day); absences and vehicle occupancy go through their own services
   * rather than their tables, per those modules' own boundary.
   */
  async getFeasibility(id: string): Promise<TransportRequestFeasibility> {
    const request = await this.prisma.transportRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException(`Transport request ${id} not found`);

    const date = toIsoDate(request.appointmentAt);
    const dayStart = parseIsoDate(date);
    const dayEnd = parseIsoDate(addIsoDays(date, 1));

    const [assignments, absences, occupancies, vehicles] = await Promise.all([
      this.prisma.scheduleAssignment.findMany({
        where: { date: dayStart, schedule: { status: ScheduleStatus.PUBLISHED } },
        include: {
          user: { select: { id: true, firstName: true, lastName: true } },
          role: true,
        },
        orderBy: [{ slot: 'asc' }],
      }),
      this.staffAbsences.findOverlapping(date, date),
      this.vehicleOccupancy.findInRange(dayStart, dayEnd),
      this.prisma.vehicle.findMany({ where: { isDeleted: false } }),
    ]);

    const roster: TodayRosterMember[] = [...assignments]
      .sort(
        (a, b) =>
          (a.role?.order ?? Number.MAX_SAFE_INTEGER) - (b.role?.order ?? Number.MAX_SAFE_INTEGER) ||
          a.user.firstName.localeCompare(b.user.firstName) ||
          a.user.lastName.localeCompare(b.user.lastName),
      )
      .map((row) => ({
        userId: row.user.id,
        firstName: row.user.firstName,
        lastName: row.user.lastName,
        roleName: row.role?.name ?? null,
      }));

    const absentUserIds = [...new Set(absences.map((absence) => absence.userId))];
    const absentUsers = absentUserIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: absentUserIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const nameByUserId = new Map(absentUsers.map((user) => [user.id, `${user.firstName} ${user.lastName}`]));
    const absentStaff: TransportRequestAbsentStaff[] = absences.map((absence) => ({
      userId: absence.userId,
      userName: nameByUserId.get(absence.userId) ?? absence.userId,
      kind: absence.kind,
      startDate: absence.startDate,
      endDate: absence.endDate,
    }));

    const vehicleById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
    const committedVehicles: TransportRequestCommittedVehicle[] = [];
    for (const occupancy of occupancies) {
      const vehicle = vehicleById.get(occupancy.vehicleId);
      // Not among the active fleet fetched above — deleted after the
      // booking was made. Nothing useful to show for it here.
      if (!vehicle) continue;
      committedVehicles.push({
        vehicleId: vehicle.id,
        licensePlate: vehicle.licensePlate,
        numeroCauda: vehicle.numeroCauda,
        vehicleType: vehicle.vehicleType as VehicleType,
        startsAt: occupancy.startsAt.toISOString(),
        endsAt: occupancy.endsAt.toISOString(),
        source: occupancy.source as VehicleOccupancySource,
        sourceId: occupancy.sourceId,
      });
    }

    const committedVehicleIds = new Set(occupancies.map((occupancy) => occupancy.vehicleId));
    const freeVehicles = vehicles.filter((vehicle) => !committedVehicleIds.has(vehicle.id));
    const freeVehiclesByType: TransportRequestFreeVehicleGroup[] = Object.values(VehicleType).map(
      (vehicleType) => ({
        vehicleType,
        vehicles: freeVehicles
          .filter((vehicle) => vehicle.vehicleType === vehicleType)
          .map((vehicle) => ({ id: vehicle.id, licensePlate: vehicle.licensePlate, numeroCauda: vehicle.numeroCauda })),
      }),
    );

    const mappedType = mapTransportRequestVehicleType(request.requestedVehicleType as TransportRequestVehicleType);
    const requestedVehicleTypeFree =
      mappedType === null
        ? null
        : (freeVehiclesByType.find((group) => group.vehicleType === mappedType)?.vehicles.length ?? 0) > 0;

    return {
      date,
      roster,
      absentStaff,
      committedVehicles,
      freeVehiclesByType,
      requestedVehicleTypeFree,
    };
  }

  async remove(id: string): Promise<TransportRequest> {
    const found = await this.prisma.transportRequest.findUnique({
      where: { id },
      include: TRANSPORT_REQUEST_INCLUDE,
    });
    if (!found) throw new NotFoundException(`Transport request ${id} not found`);
    const deleted = await this.prisma.transportRequest.delete({
      where: { id },
      include: TRANSPORT_REQUEST_INCLUDE,
    });
    return serializeTransportRequest(deleted as TransportRequestRow);
  }

  private normalize(dto: {
    batchReference: string;
    communicatedAt: string;
    requesterAccountCode: string;
    responseDueAt: string;
    externalServiceNumber: string;
    appointmentAt: string;
    requestingOrganisationId: string;
    payingOrganisationId: string;
    agreementId?: string | null;
    patientId: string;
    occurrenceType: CreateTransportRequestDto['occurrenceType'];
    requestedVehicleType: CreateTransportRequestDto['requestedVehicleType'];
    escortTravels?: boolean;
    isRoundTrip?: boolean;
    originAddress: string;
    originLatitude?: number | null;
    originLongitude?: number | null;
    destinationFacilityId?: string | null;
    destinationFacility?: CreateTransportRequestDto['destinationFacility'];
    freeTextMessage?: string | null;
    coordColumnValue?: string | null;
  }) {
    return {
      batchReference: dto.batchReference?.trim() ?? '',
      communicatedAt: dto.communicatedAt,
      requesterAccountCode: dto.requesterAccountCode?.trim() ?? '',
      responseDueAt: dto.responseDueAt,
      externalServiceNumber: dto.externalServiceNumber?.trim() ?? '',
      appointmentAt: dto.appointmentAt,
      requestingOrganisationId: dto.requestingOrganisationId,
      payingOrganisationId: dto.payingOrganisationId,
      agreementId: dto.agreementId || null,
      patientId: dto.patientId,
      occurrenceType: dto.occurrenceType,
      requestedVehicleType: dto.requestedVehicleType,
      escortTravels: dto.escortTravels ?? false,
      isRoundTrip: dto.isRoundTrip ?? false,
      originAddress: dto.originAddress?.trim() ?? '',
      originLatitude: dto.originLatitude ?? null,
      originLongitude: dto.originLongitude ?? null,
      destinationFacilityId: dto.destinationFacilityId || null,
      destinationFacility: dto.destinationFacility ?? null,
      freeTextMessage: dto.freeTextMessage?.trim() || null,
      coordColumnValue: dto.coordColumnValue?.trim() || null,
    };
  }

  private async resolveDestinationFacilityId(input: NormalizedTransportRequestInput): Promise<string> {
    if (input.destinationFacilityId) {
      const exists = await this.prisma.facility.count({ where: { id: input.destinationFacilityId } });
      if (exists === 0) throw new BadRequestException(`Facility ${input.destinationFacilityId} not found`);
      return input.destinationFacilityId;
    }
    // `validateTransportRequest` already refused "neither" — `destinationFacility`
    // is guaranteed to be set here.
    const facility = await this.facilities.findOrCreateTransportDestination(
      input.destinationFacility!.name,
      input.destinationFacility!.municipalityId,
      input.destinationFacility!.addressLine,
      input.destinationFacility!.postalCode,
    );
    return facility.id;
  }

  private async assertOrganisationHasRole(
    organisationId: string,
    role: 'isRequester' | 'isPayer',
  ): Promise<void> {
    const organisation = await this.prisma.organisation.findUnique({ where: { id: organisationId } });
    if (!organisation) throw new BadRequestException(`Organisation ${organisationId} not found`);
    if (!organisation[role]) {
      throw new BadRequestException(
        role === 'isRequester'
          ? `"${organisation.name}" is not flagged as a requester.`
          : `"${organisation.name}" is not flagged as a payer.`,
      );
    }
  }

  private async assertAgreementScopedToPayer(agreementId: string, payingOrganisationId: string): Promise<void> {
    const agreement = await this.prisma.agreement.findUnique({ where: { id: agreementId } });
    if (!agreement) throw new BadRequestException(`Agreement ${agreementId} not found`);
    if (agreement.payerOrganisationId !== payingOrganisationId) {
      throw new BadRequestException('The agreement is not scoped to the paying organisation.');
    }
  }

  private async assertPatientExists(patientId: string): Promise<void> {
    const exists = await this.prisma.patient.count({ where: { id: patientId } });
    if (exists === 0) throw new BadRequestException(`Patient ${patientId} not found`);
  }

  private async assertExternalServiceNumberFree(
    requestingOrganisationId: string,
    externalServiceNumber: string,
    exceptId?: string,
  ): Promise<void> {
    const clash = await this.prisma.transportRequest.findFirst({
      where: {
        requestingOrganisationId,
        externalServiceNumber,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
    });
    if (clash) {
      throw new ConflictException(
        `"${externalServiceNumber}" is already used by that requesting organisation.`,
      );
    }
  }
}
