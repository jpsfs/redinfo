import { Injectable } from '@nestjs/common';
import {
  CrewSuggestionResponse,
  CrewSuggestionShift,
  EventReportType,
  SchedulePerson,
  ScheduleStatus,
  ShiftDefinition,
  ShiftTimes,
  applyShiftOverrides,
  availabilityWindowLabel,
  categoryForEventReportType,
  eventReportCrewEligibleRoles,
  formatShiftLabel,
} from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ShiftScheduleService } from '../availability/shift-schedule.service';
import { addIsoDays, toIsoDate } from '../utils/date.util';
import { CERT_HELD_SELECT, toSchedulePerson } from '../users/certifications.util';

const CANDIDATE_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  certifications: { select: CERT_HELD_SELECT },
} as const;

/**
 * How far back the "change shift" sheet looks.
 *
 * A report is normally filed the same night, sometimes the morning after, and
 * occasionally at the end of a busy week. Two weeks covers that without
 * turning the sheet into a history browser.
 */
export const RECENT_SHIFT_WINDOW_DAYS = 14;

/** How many past shifts the sheet offers. A phone list, not a report. */
export const RECENT_SHIFT_LIMIT = 12;

/**
 * Who was on shift, so a report does not have to be typed from memory.
 *
 * The crew comes from the *published* schedule of the availability window whose
 * category matches the report's type — that mapping lives in
 * `EVENT_REPORT_TYPE_RULES`, so an emergency report is offered the emergency
 * rota and never the SALOP one.
 *
 * Drafts are ignored: a rota nobody has published is not a statement about who
 * was out.
 */
@Injectable()
export class EventReportCrewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shiftSchedule: ShiftScheduleService,
  ) {}

  /**
   * Who may appear on a crew at all — the same roster availability is
   * collected from, as a narrow list so filing a report never needs
   * `VIEW_USERS`.
   */
  async listCandidates(): Promise<SchedulePerson[]> {
    const rows = await this.prisma.user.findMany({
      where: { isActive: true, roles: { hasSome: eventReportCrewEligibleRoles() as never[] } },
      select: CANDIDATE_SELECT,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    return rows.map((row) => toSchedulePerson(row));
  }

  /**
   * The shift to pre-fill from, plus the recent shifts to offer instead.
   *
   * `at` is the moment the activity started. The suggested shift is the one
   * whose clock span contains it on that day; when nothing covers it — a call
   * that came in off-rota, or a report backdated to a day nobody was on — the
   * suggestion is null and the sheet's recent list is the whole answer.
   */
  async suggestCrew(
    type: EventReportType,
    at: Date,
    today = new Date(),
  ): Promise<CrewSuggestionResponse> {
    const category = categoryForEventReportType(type);
    const date = toIsoDate(at);
    const from = addIsoDays(toIsoDate(today), -RECENT_SHIFT_WINDOW_DAYS);
    // The report's own day may be older than the lookback window (a report
    // filed weeks late), so the range always includes it.
    const rangeStart = date < from ? date : from;
    const rangeEnd = date > toIsoDate(today) ? date : toIsoDate(today);

    const shifts = await this.loadShifts(category, rangeStart, rangeEnd);

    const minuteOfDay = at.getUTCHours() * 60 + at.getUTCMinutes();
    const suggested =
      shifts.find(
        (shift) =>
          shift.date === date &&
          minuteOfDay >= shift.startMinute &&
          minuteOfDay < shift.endMinute,
      ) ?? null;

    const recent = shifts
      .filter((shift) => shift !== suggested)
      .sort(
        (a, b) => b.date.localeCompare(a.date) || b.startMinute - a.startMinute,
      )
      .slice(0, RECENT_SHIFT_LIMIT);

    return { suggested, recent };
  }

  /**
   * Every crewed shift of one category in a date range, as the sheet shows
   * them.
   *
   * Built from assignments rather than from the shift grid: a shift nobody was
   * scheduled onto is not a crew anyone can claim to have been, so it is not
   * offered.
   */
  private async loadShifts(
    category: string,
    from: string,
    to: string,
  ): Promise<CrewSuggestionShift[]> {
    const schedules = await this.prisma.schedule.findMany({
      where: {
        status: ScheduleStatus.PUBLISHED,
        window: { category: category as never },
      },
      include: {
        window: true,
        assignments: {
          where: {
            date: {
              gte: new Date(`${from}T00:00:00.000Z`),
              lte: new Date(`${to}T00:00:00.000Z`),
            },
          },
          include: {
            user: { select: CANDIDATE_SELECT },
            // The post is read through the role relation and copied onto the
            // report as a name — see `EventReportCrewMember.roleName`.
            role: { select: { name: true } },
          },
          orderBy: [{ date: 'asc' }, { slot: 'asc' }],
        },
      },
    });

    const result: CrewSuggestionShift[] = [];

    for (const schedule of schedules) {
      if (schedule.assignments.length === 0) continue;

      const rawPattern = await this.shiftSchedule.getPatternForWindow({
        id: schedule.windowId,
        startDate: toIsoDate(schedule.window.startDate),
        endDate: toIsoDate(schedule.window.endDate),
      });
      // A coordinator may have moved this schedule's own shift hours; the
      // crew sheet should offer what was actually worked, not the window's
      // original grid — that is what decides which shift an activity time
      // falls into, below.
      const overrideRows = await this.prisma.scheduleShiftOverride.findMany({
        where: { scheduleId: schedule.id },
      });
      const overrideTimes = new Map<string, ShiftTimes>(
        overrideRows.map((row) => [
          `${toIsoDate(row.date)}#${row.slot}`,
          { startMinute: row.startMinute, endMinute: row.endMinute },
        ]),
      );
      const pattern = applyShiftOverrides(rawPattern, overrideTimes);

      // (date, slot) → the shift's clock span, so an assignment can be told
      // what hours it covered.
      const spans = new Map<string, ShiftDefinition>(
        pattern.flatMap((day) =>
          day.shifts.map(
            (shift) => [`${day.date}#${shift.slot}`, shift] as [string, ShiftDefinition],
          ),
        ),
      );

      // Keyed by `date#slot`, which is what identifies a shift everywhere in
      // the scheduling code; the date and slot are carried alongside so the
      // key never has to be parsed back apart.
      const grouped = new Map<
        string,
        { date: string; slot: number; assignments: typeof schedule.assignments }
      >();
      for (const assignment of schedule.assignments) {
        const date = toIsoDate(assignment.date);
        const key = `${date}#${assignment.slot}`;
        const bucket =
          grouped.get(key) ?? { date, slot: assignment.slot, assignments: [] };
        bucket.assignments.push(assignment);
        grouped.set(key, bucket);
      }

      for (const [key, { date, slot, assignments }] of grouped) {
        const span = spans.get(key);
        // A shift the window no longer describes still has a crew, and that
        // crew is still the answer — it just cannot be labelled with hours.
        result.push({
          scheduleId: schedule.id,
          date,
          slot,
          label: span ? span.label : `Shift ${slot}`,
          windowLabel: availabilityWindowLabel({
            category: schedule.window.category,
            name: schedule.window.name,
          }),
          startMinute: span?.startMinute ?? 0,
          endMinute: span?.endMinute ?? 0,
          vehiclesNeeded: span?.vehiclesNeeded ?? 0,
          crew: assignments.map((assignment) => ({
            userId: assignment.userId,
            firstName: assignment.user.firstName,
            lastName: assignment.user.lastName,
            roleName: assignment.role?.name ?? null,
            isDriver: toSchedulePerson(assignment.user).isDriver,
          })),
        });
      }
    }

    return result;
  }
}

/** Re-exported so a caller can label a shift without importing shared twice. */
export { formatShiftLabel };
