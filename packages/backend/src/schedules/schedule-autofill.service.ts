import { Injectable } from '@nestjs/common';
import {
  AutofillReport,
  AvailabilityWindowRole,
  availabilityEligibleRoles,
  holdsCertification,
  requiredSlotsForShift,
  SchedulePerson,
  shiftsOverlap,
  UNLIMITED_ROLE_PEOPLE,
} from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { toIsoDate } from '../utils/date.util';
import { CERT_HELD_SELECT, today, toSchedulePerson } from '../users/certifications.util';
import { AutofillScheduleDto } from './dto/autofill-schedule.dto';
import { SchedulesService, shiftKey } from './schedules.service';

type Person = SchedulePerson;

interface PlannedAssignment {
  date: string;
  slot: number;
  userId: string;
  roleId: string | null;
}

/**
 * Turning submitted availability into a first draft.
 *
 * Deliberately deterministic — the same window and the same submissions always
 * produce the same draft — so a coordinator who re-runs it does not get a
 * reshuffled rota, and so the behaviour is testable at all.
 *
 * The draft is only ever a starting point: every row it writes is an ordinary
 * assignment the coordinator can remove or replace, and it never places anyone
 * who did not submit for the shift (that is an override, which is a human
 * decision, not something a generator should make).
 */
@Injectable()
export class ScheduleAutofillService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schedules: SchedulesService,
  ) {}

  async autofill(
    scheduleId: string,
    dto: AutofillScheduleDto,
    assignedById: string,
  ): Promise<AutofillReport> {
    const mode = dto.mode ?? 'EMPTY';
    const fairness = dto.fairness ?? true;
    const context = await this.schedules.loadContext(scheduleId);

    if (mode === 'REPLACE') {
      await this.prisma.scheduleAssignment.deleteMany({ where: { scheduleId } });
    }

    const asOf = today();
    const [rosterRows, submissions, existing] = await Promise.all([
      this.prisma.user.findMany({
        where: { isActive: true, roles: { hasSome: availabilityEligibleRoles() as never[] } },
        select: { id: true, firstName: true, lastName: true, certifications: { select: CERT_HELD_SELECT } },
      }),
      this.prisma.availabilitySubmission.findMany({
        where: { windowId: context.window.id },
        select: { userId: true, date: true, slot: true },
      }),
      mode === 'REPLACE'
        ? Promise.resolve([])
        : this.prisma.scheduleAssignment.findMany({
            where: { scheduleId },
            select: { userId: true, date: true, slot: true, roleId: true },
          }),
    ]);

    const roster = rosterRows.map((row) => toSchedulePerson(row, asOf));
    const people = new Map(roster.map((person) => [person.id, person]));

    /** Who submitted for each shift, as `date#slot` → userIds. */
    const availableByShift = new Map<string, string[]>();
    for (const submission of submissions) {
      if (!people.has(submission.userId)) continue;
      const key = shiftKey(toIsoDate(submission.date), submission.slot);
      const bucket = availableByShift.get(key) ?? [];
      bucket.push(submission.userId);
      availableByShift.set(key, bucket);
    }

    // Running state, seeded from whatever is already on the schedule so
    // "only empty slots" respects hand-placed people in every count it keeps.
    const dutyCount = new Map<string, number>();
    const occupancy = new Map<string, PlannedAssignment[]>();
    for (const row of existing) {
      const date = toIsoDate(row.date);
      const entry = { date, slot: row.slot, userId: row.userId, roleId: row.roleId };
      dutyCount.set(row.userId, (dutyCount.get(row.userId) ?? 0) + 1);
      const key = shiftKey(date, row.slot);
      occupancy.set(key, [...(occupancy.get(key) ?? []), entry]);
    }

    const planned: PlannedAssignment[] = [];

    // Chronological, so "fewest duties so far" means what a reader expects:
    // the load is spread across the window as it is walked, not retrofitted.
    for (const day of context.pattern) {
      for (const shift of day.shifts) {
        const key = shiftKey(day.date, shift.slot);
        const onShift = occupancy.get(key) ?? [];
        const candidates = (availableByShift.get(key) ?? [])
          .map((id) => people.get(id))
          .filter((person): person is Person => person !== undefined);

        const roles: Array<AvailabilityWindowRole | null> =
          context.roles.length > 0 ? context.roles : [null];

        for (const role of roles) {
          const target = this.targetFor(role, context.roles);
          for (let filled = this.countIn(onShift, role); filled < target; filled += 1) {
            const pick = this.pick({
              candidates,
              role,
              onShift,
              occupancy,
              day: day.date,
              shift,
              context,
              dutyCount,
              fairness,
              asOf,
              driversStillNeeded:
                shift.vehiclesNeeded - onShift.filter((a) => people.get(a.userId)?.isDriver).length,
            });
            if (!pick) break;

            const entry: PlannedAssignment = {
              date: day.date,
              slot: shift.slot,
              userId: pick.id,
              roleId: role?.id ?? null,
            };
            planned.push(entry);
            onShift.push(entry);
            occupancy.set(key, onShift);
            dutyCount.set(pick.id, (dutyCount.get(pick.id) ?? 0) + 1);
          }
        }
      }
    }

    if (planned.length > 0) {
      await this.prisma.scheduleAssignment.createMany({
        data: planned.map((entry) => ({
          scheduleId,
          date: new Date(`${entry.date}T00:00:00.000Z`),
          slot: entry.slot,
          userId: entry.userId,
          roleId: entry.roleId,
          // Everyone the generator places submitted for the shift, by
          // construction — it never overrides anyone.
          isOverride: false,
          assignedById,
        })),
        skipDuplicates: true,
      });
    }

    return this.report(context, occupancy, people, planned.length);
  }

  /**
   * How many people a role should be filled to.
   *
   * An unlimited role is a pool, not a post: there is no number to fill it to,
   * so the generator leaves it to the coordinator. A window with no roles takes
   * one person per shift, which is the least the shift can run on.
   */
  private targetFor(
    role: AvailabilityWindowRole | null,
    roles: AvailabilityWindowRole[],
  ): number {
    if (!role) return roles.length === 0 ? 1 : 0;
    return role.maxPeople === UNLIMITED_ROLE_PEOPLE ? 0 : role.maxPeople;
  }

  private countIn(onShift: PlannedAssignment[], role: AvailabilityWindowRole | null): number {
    return onShift.filter((entry) => entry.roleId === (role?.id ?? null)).length;
  }

  /**
   * The next person for a slot.
   *
   * Ordering, in priority order:
   *  1. while the shift still lacks a driver for every vehicle, a certified
   *     driver — this is what gets a two-vehicle shift two drivers even when the
   *     window's Driver post only holds one;
   *  2. fewest duties so far, when fairness is on;
   *  3. surname then forename, purely so the result is reproducible.
   */
  private pick({
    candidates,
    role,
    onShift,
    occupancy,
    day,
    shift,
    context,
    dutyCount,
    fairness,
    asOf,
    driversStillNeeded,
  }: {
    candidates: Person[];
    role: AvailabilityWindowRole | null;
    onShift: PlannedAssignment[];
    occupancy: Map<string, PlannedAssignment[]>;
    day: string;
    shift: { slot: number; startMinute: number; endMinute: number };
    context: { shifts: Map<string, { startMinute: number; endMinute: number; slot: number }> };
    dutyCount: Map<string, number>;
    fairness: boolean;
    asOf: string;
    driversStillNeeded: number;
  }): Person | null {
    const taken = new Set(onShift.map((entry) => entry.userId));

    // Autofill never overrides — a person missing the post's requirement is
    // simply not a candidate for it, unlike a coordinator assigning by hand.
    const eligible = candidates.filter((person) => {
      if (taken.has(person.id)) return false;
      if (role?.requiredCertification && !holdsCertification(person.certifications, role.requiredCertification, asOf)) {
        return false;
      }
      return !this.overlapsExisting(person.id, day, shift, occupancy, context);
    });
    if (eligible.length === 0) return null;

    const wantsDriver = driversStillNeeded > 0;
    const sorted = [...eligible].sort((a, b) => {
      if (wantsDriver && a.isDriver !== b.isDriver) return a.isDriver ? -1 : 1;
      if (fairness) {
        const load = (dutyCount.get(a.id) ?? 0) - (dutyCount.get(b.id) ?? 0);
        if (load !== 0) return load;
      }
      return (
        a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)
      );
    });

    return sorted[0];
  }

  /**
   * True when the person already holds a duty on this schedule that runs at the
   * same time. The generator will not create a clash even though a coordinator
   * may knowingly cause one by hand.
   */
  private overlapsExisting(
    userId: string,
    day: string,
    shift: { slot: number; startMinute: number; endMinute: number },
    occupancy: Map<string, PlannedAssignment[]>,
    context: { shifts: Map<string, { startMinute: number; endMinute: number; slot: number }> },
  ): boolean {
    // The same shift is already covered by `taken`; this is the other shifts of
    // the same day, which a window may well have overlapping.
    for (const [key, entry] of context.shifts) {
      if (!key.startsWith(`${day}#`)) continue;
      if (entry.slot === shift.slot) continue;
      if (!shiftsOverlap(shift, entry)) continue;
      const others = occupancy.get(key) ?? [];
      if (others.some((planned) => planned.userId === userId)) return true;
    }
    return false;
  }

  private report(
    context: { pattern: Array<{ date: string; shifts: Array<{ slot: number; vehiclesNeeded: number }> }>; roles: AvailabilityWindowRole[] },
    occupancy: Map<string, PlannedAssignment[]>,
    people: Map<string, Person>,
    placed: number,
  ): AutofillReport {
    const perShift = requiredSlotsForShift(context.roles);
    let required = 0;
    let filled = 0;
    let shiftsWithoutDriver = 0;

    for (const day of context.pattern) {
      for (const shift of day.shifts) {
        const onShift = occupancy.get(shiftKey(day.date, shift.slot)) ?? [];
        required += perShift;
        filled += onShift.length;
        const drivers = onShift.filter((entry) => people.get(entry.userId)?.isDriver).length;
        if (shift.vehiclesNeeded > 0 && drivers < shift.vehiclesNeeded) shiftsWithoutDriver += 1;
      }
    }

    return {
      placed,
      unfilled: Math.max(0, required - filled),
      shiftsWithoutDriver,
    };
  }
}
