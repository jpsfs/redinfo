import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ScheduleStatus } from '@prisma/client';
import { TripCrewCandidate, effectiveCertifications } from '@redinfo/shared';
import { parseIsoDate, toIsoDate } from '../utils/date.util';
import { PrismaService } from '../prisma/prisma.service';
import { StaffAbsencesService } from '../staff-absences/staff-absences.service';
import { CERT_HELD_SELECT, toHeldCertifications } from '../users/certifications.util';
import { AddTripCrewMemberDto } from './dto/add-trip-crew-member.dto';
import { serializeTripCrewMember } from './trip.serializer';

/**
 * Crew assignment for a `Trip` (#234, #235). Unavailability follows the
 * override precedent used everywhere else in this schema
 * (`ScheduleAssignment.certificationOverrideReason`,
 * `VehicleOccupancy.overrideReason`): adding someone with a `StaffAbsence`
 * covering the trip's date throws unless `overrideReason` is supplied in the
 * same call. `TripsService.getDetail` rechecks this fresh on every read, for
 * an absence recorded *after* the crew member was added.
 *
 * Crew *composition* — how many, holding what — is deliberately not checked
 * here. It is a constraint a journey grows into rather than one a single write
 * can satisfy, so it is ranked on read by `checkTripCrew`; see that function's
 * doc comment.
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

    // The same crew normally works the same vehicle all day, so one action
    // covers the whole day's journeys — but each `Trip` still owns its own
    // crew row, because "all day" is a habit and not a rule. Journeys they
    // are already on are skipped rather than being a conflict: the planner
    // asked for "these people, this vehicle, today", and partially satisfying
    // that already is not an error.
    const tripIds = dto.applyToVehicleDay
      ? (
          await this.prisma.trip.findMany({
            where: { vehicleId: trip.vehicleId, date: trip.date },
            select: { id: true },
          })
        ).map((row) => row.id)
      : [tripId];

    const existing = new Set(
      (
        await this.prisma.tripCrewMember.findMany({
          where: { tripId: { in: tripIds }, userId: dto.userId },
          select: { tripId: true },
        })
      ).map((row) => row.tripId),
    );

    const created = await this.prisma.$transaction(
      tripIds
        .filter((id) => !existing.has(id))
        .map((id) =>
          this.prisma.tripCrewMember.create({
            data: {
              tripId: id,
              userId: dto.userId,
              role: dto.role as never,
              overrideReason: dto.overrideReason ?? null,
            },
          }),
        ),
    );

    // The row for the trip actually addressed, which is what a caller that
    // ignored `applyToVehicleDay` expects back.
    const own = created.find((row) => row.tripId === tripId);
    if (!own) throw new ConflictException('This person is already on the trip\'s crew.');
    return serializeTripCrewMember(own);
  }

  async remove(tripId: string, crewMemberId: string): Promise<void> {
    const member = await this.prisma.tripCrewMember.findUnique({ where: { id: crewMemberId } });
    if (!member || member.tripId !== tripId) {
      throw new NotFoundException(`Crew member ${crewMemberId} not found on trip ${tripId}`);
    }
    await this.prisma.tripCrewMember.delete({ where: { id: crewMemberId } });
  }

  /**
   * Everyone the crew dialog may offer for a journey on `date`.
   *
   * Nobody is filtered out. An absent person, or one already crewing another
   * journey, is listed and flagged rather than hidden — the same posture the
   * roster and vehicle-occupancy screens take, and the reason both facts are
   * on the shape instead of being silently applied here. Certifications are
   * resolved against `date`, not today, for the same reason `loadCrew` does.
   */
  async listCandidates(date: string): Promise<TripCrewCandidate[]> {
    const day = parseIsoDate(date);
    const [users, absences, crewRows, assignments] = await Promise.all([
      this.prisma.user.findMany({
        where: { isActive: true },
        select: { id: true, firstName: true, lastName: true, certifications: { select: CERT_HELD_SELECT } },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      }),
      this.staffAbsences.findOverlapping(date, date),
      this.prisma.tripCrewMember.findMany({
        where: { trip: { date: day } },
        select: { userId: true, tripId: true },
      }),
      this.prisma.scheduleAssignment.findMany({
        where: { date: day, schedule: { status: ScheduleStatus.PUBLISHED } },
        select: { userId: true },
      }),
    ]);

    const absent = new Set(absences.map((absence) => absence.userId));
    const onRoster = new Set(assignments.map((assignment) => assignment.userId));
    const crewingByUser = new Map<string, string[]>();
    for (const row of crewRows) {
      crewingByUser.set(row.userId, [...(crewingByUser.get(row.userId) ?? []), row.tripId]);
    }

    return users
      .map((user) => ({
        userId: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        certifications: effectiveCertifications(toHeldCertifications(user.certifications), date)
          .filter((cert) => cert.status !== 'EXPIRED')
          .map((cert) => cert.type),
        absent: absent.has(user.id),
        crewingTripIds: crewingByUser.get(user.id) ?? [],
        onRoster: onRoster.has(user.id),
      }))
      // Rostered first — the people a planner reaches for before anyone else.
      // Everything past that is the alphabetical order the query already set.
      .sort((a, b) => Number(b.onRoster) - Number(a.onRoster));
  }
}
