import { Injectable } from '@nestjs/common';
import {
  EventReportType,
  PeopleStatistics,
  PeopleStatisticsRosterEntry,
  StatisticsMonthPoint,
  StatisticsQuery,
  VolunteerActivityType,
  VolunteerHoursStatus,
} from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { VolunteerHoursService } from '../volunteer-hours/volunteer-hours.service';
import { parseIsoDate, toIsoDate } from '../utils/date.util';
import { monthKey, monthRange, previousPeriodRange, resolveStatisticsRange } from './statistics.util';

interface UserTotals {
  firstName: string;
  lastName: string;
  minutes: number;
  emergencyEvents: number;
  supportEvents: number;
  byActivityType: Partial<Record<VolunteerActivityType, number>>;
  lastActivityDate: string | null;
}

/**
 * Tab 1 — Pessoas & Horas (docs/plans/estatisticas-dashboards.md §2).
 *
 * Ungated and org-wide, same rule the delegation already applies to approved
 * hours: only `APPROVED`, non-deleted entries count, and the roster names
 * everyone — there is no per-viewer capability check here, only a query range.
 */
@Injectable()
export class StatisticsPeopleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly volunteerHours: VolunteerHoursService,
  ) {}

  async getStatistics(query: StatisticsQuery, viewerId: string): Promise<PeopleStatistics> {
    const { from, to } = resolveStatisticsRange(query.from, query.to);
    const { from: prevFrom, to: prevTo } = previousPeriodRange(from, to);

    // Generation is lazy — refresh first so a never-before-read period still
    // reports complete numbers, same reason `VolunteerHoursSummaryService`
    // calls this before its own query.
    await this.volunteerHours.refreshGeneration();

    const [entries, prevEntries, crew] = await Promise.all([
      this.prisma.volunteerHoursEntry.findMany({
        where: {
          status: VolunteerHoursStatus.APPROVED,
          deletedAt: null,
          date: { gte: parseIsoDate(from), lte: parseIsoDate(to) },
        },
        select: {
          userId: true,
          minutes: true,
          activityType: true,
          date: true,
          user: { select: { firstName: true, lastName: true } },
        },
      }),
      this.prisma.volunteerHoursEntry.findMany({
        where: {
          status: VolunteerHoursStatus.APPROVED,
          deletedAt: null,
          date: { gte: parseIsoDate(prevFrom), lte: parseIsoDate(prevTo) },
        },
        select: { userId: true, minutes: true },
      }),
      this.prisma.eventReportCrewMember.findMany({
        where: {
          report: {
            submittedAt: { not: null },
            occurredOn: { gte: parseIsoDate(from), lte: parseIsoDate(to) },
          },
        },
        select: {
          userId: true,
          report: { select: { id: true, type: true, occurredOn: true } },
        },
      }),
    ]);

    const byUser = new Map<string, UserTotals>();
    const ensure = (userId: string, firstName: string, lastName: string): UserTotals => {
      let totals = byUser.get(userId);
      if (!totals) {
        totals = {
          firstName,
          lastName,
          minutes: 0,
          emergencyEvents: 0,
          supportEvents: 0,
          byActivityType: {},
          lastActivityDate: null,
        };
        byUser.set(userId, totals);
      }
      return totals;
    };

    const monthlyTotals = new Map<string, number>();
    const activityTotals = new Map<VolunteerActivityType, number>();
    let totalMinutes = 0;

    for (const entry of entries) {
      const totals = ensure(entry.userId, entry.user.firstName, entry.user.lastName);
      totals.minutes += entry.minutes;
      const activityType = entry.activityType as VolunteerActivityType;
      totals.byActivityType[activityType] = (totals.byActivityType[activityType] ?? 0) + entry.minutes;
      const dateIso = toIsoDate(entry.date);
      if (!totals.lastActivityDate || dateIso > totals.lastActivityDate) totals.lastActivityDate = dateIso;

      totalMinutes += entry.minutes;
      const month = monthKey(entry.date);
      monthlyTotals.set(month, (monthlyTotals.get(month) ?? 0) + entry.minutes);
      activityTotals.set(activityType, (activityTotals.get(activityType) ?? 0) + entry.minutes);
    }

    const reportIds = new Set<string>();
    for (const member of crew) {
      reportIds.add(member.report.id);
      const totals = byUser.get(member.userId) ?? ensure(member.userId, '', '');
      if (member.report.type === EventReportType.EMERGENCY) totals.emergencyEvents += 1;
      else totals.supportEvents += 1;
      const occurredOnIso = toIsoDate(member.report.occurredOn);
      if (!totals.lastActivityDate || occurredOnIso > totals.lastActivityDate) {
        totals.lastActivityDate = occurredOnIso;
      }
    }

    // A crew member row that never contributed an hours entry has no name
    // filled in by `ensure`'s fallback above — this backfills it. It should
    // be rare (a submitted report always lists real users), but roster names
    // must never silently blank out.
    const missingNames = [...byUser.entries()].filter(([, t]) => t.firstName === '' && t.lastName === '');
    if (missingNames.length > 0) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: missingNames.map(([userId]) => userId) } },
        select: { id: true, firstName: true, lastName: true },
      });
      for (const user of users) {
        const totals = byUser.get(user.id);
        if (totals) {
          totals.firstName = user.firstName;
          totals.lastName = user.lastName;
        }
      }
    }

    const roster: PeopleStatisticsRosterEntry[] = [...byUser.entries()]
      .map(([userId, totals]) => ({
        userId,
        firstName: totals.firstName,
        lastName: totals.lastName,
        hours: roundHours(totals.minutes),
        events: totals.emergencyEvents + totals.supportEvents,
        emergencyEvents: totals.emergencyEvents,
        supportEvents: totals.supportEvents,
        lastActivityDate: totals.lastActivityDate,
      }))
      .sort((a, b) => b.hours - a.hours || `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`));

    const months = monthRange(from, to);
    const monthlyHours: StatisticsMonthPoint[] = months.map((month) => ({
      month,
      value: roundHours(monthlyTotals.get(month) ?? 0),
    }));

    const hoursByActivityType = Object.values(VolunteerActivityType).map((activityType) => ({
      activityType,
      hours: roundHours(activityTotals.get(activityType) ?? 0),
    }));

    const activeVolunteers = [...byUser.values()].filter((t) => t.minutes > 0).length;
    const previousPeriodMinutesByUser = new Map<string, number>();
    for (const entry of prevEntries) {
      previousPeriodMinutesByUser.set(entry.userId, (previousPeriodMinutesByUser.get(entry.userId) ?? 0) + entry.minutes);
    }
    const previousPeriodActiveVolunteers = [...previousPeriodMinutesByUser.values()].filter((m) => m > 0).length;

    const viewerIndex = roster.findIndex((r) => r.userId === viewerId);
    const viewerMonthly = months.map((month) => ({
      month,
      value: roundHours(
        entries
          .filter((e) => e.userId === viewerId && monthKey(e.date) === month)
          .reduce((sum, e) => sum + e.minutes, 0),
      ),
    }));

    return {
      from,
      to,
      totalApprovedHours: roundHours(totalMinutes),
      activeVolunteers,
      previousPeriodActiveVolunteers,
      eventsWithParticipation: reportIds.size,
      averageHoursPerVolunteer: activeVolunteers > 0 ? roundHours(totalMinutes / activeVolunteers) : 0,
      viewer: {
        hours: roundHours(byUser.get(viewerId)?.minutes ?? 0),
        previousPeriodHours: roundHours(previousPeriodMinutesByUser.get(viewerId) ?? 0),
        events: byUser.get(viewerId) ? byUser.get(viewerId)!.emergencyEvents + byUser.get(viewerId)!.supportEvents : 0,
        rank: viewerIndex === -1 ? null : viewerIndex + 1,
        totalVolunteers: roster.length,
        monthlyHours: viewerMonthly,
      },
      monthlyHours,
      hoursByActivityType,
      roster,
    };
  }
}

/** Minutes → hours, rounded to one decimal — whole numbers wherever shifts already are. */
function roundHours(minutes: number): number {
  return Math.round((minutes / 60) * 10) / 10;
}
