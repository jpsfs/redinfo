import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { toIsoDate } from '../utils/date.util';
import { PrismaService } from '../prisma/prisma.service';
import { StaffAbsencesService } from '../staff-absences/staff-absences.service';
import { AddTripCrewMemberDto } from './dto/add-trip-crew-member.dto';
import { serializeTripCrewMember } from './trip.serializer';

/**
 * Crew assignment for a `Trip` (#234). Unavailability follows the override
 * precedent used everywhere else in this schema
 * (`ScheduleAssignment.certificationOverrideReason`,
 * `VehicleOccupancy.overrideReason`): adding someone with a `StaffAbsence`
 * covering the trip's date throws unless `overrideReason` is supplied in the
 * same call. `TripsService.getDetail` rechecks this fresh on every read, for
 * an absence recorded *after* the crew member was added.
 */
@Injectable()
export class TripCrewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly staffAbsences: StaffAbsencesService,
  ) {}

  async add(tripId: string, dto: AddTripCrewMemberDto) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw new NotFoundException(`Trip ${tripId} not found`);

    const already = await this.prisma.tripCrewMember.findUnique({
      where: { tripId_userId: { tripId, userId: dto.userId } },
    });
    if (already) throw new ConflictException('This person is already on the trip\'s crew.');

    if (!dto.overrideReason) {
      const date = toIsoDate(trip.date);
      const absences = await this.staffAbsences.findOverlapping(date, date);
      if (absences.some((absence) => absence.userId === dto.userId)) {
        throw new ConflictException(
          'This person is recorded absent on the trip\'s date. Give an override reason to add them anyway.',
        );
      }
    }

    const row = await this.prisma.tripCrewMember.create({
      data: {
        tripId,
        userId: dto.userId,
        role: dto.role as never,
        overrideReason: dto.overrideReason ?? null,
      },
    });
    return serializeTripCrewMember(row);
  }

  async remove(tripId: string, crewMemberId: string): Promise<void> {
    const member = await this.prisma.tripCrewMember.findUnique({ where: { id: crewMemberId } });
    if (!member || member.tripId !== tripId) {
      throw new NotFoundException(`Crew member ${crewMemberId} not found on trip ${tripId}`);
    }
    await this.prisma.tripCrewMember.delete({ where: { id: crewMemberId } });
  }
}
