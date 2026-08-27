import { Injectable } from '@nestjs/common';
import {
  VolunteerActivityType,
  VolunteerHoursStatus,
  VolunteerHoursSummaryResponse,
  VolunteerHoursSummaryRow,
} from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { VolunteerHoursService } from './volunteer-hours.service';
import { parseIsoDate } from '../utils/date.util';

/**
 * Approved-vs-pending totals per volunteer over a period, broken down by
 * activity type — the coordinator's oversight half of #164. Generation is
 * refreshed first (via `VolunteerHoursService`) so a period that has never
 * been read from `/me` or the review queue still reports complete numbers.
 */
@Injectable()
export class VolunteerHoursSummaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly volunteerHours: VolunteerHoursService,
  ) {}

  async getSummary(from: string, to: string): Promise<VolunteerHoursSummaryResponse> {
    await this.volunteerHours.refreshGeneration();

    const rows = await this.prisma.volunteerHoursEntry.findMany({
      where: { date: { gte: parseIsoDate(from), lte: parseIsoDate(to) } },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });

    const byUser = new Map<string, VolunteerHoursSummaryRow>();
    for (const row of rows) {
      let entry = byUser.get(row.userId);
      if (!entry) {
        entry = {
          userId: row.userId,
          firstName: row.user.firstName,
          lastName: row.user.lastName,
          approvedMinutes: 0,
          pendingMinutes: 0,
          byActivityType: {},
        };
        byUser.set(row.userId, entry);
      }

      if (row.status === VolunteerHoursStatus.APPROVED) {
        entry.approvedMinutes += row.minutes;
        const activityType = row.activityType as VolunteerActivityType;
        entry.byActivityType[activityType] = (entry.byActivityType[activityType] ?? 0) + row.minutes;
      } else {
        entry.pendingMinutes += row.minutes;
      }
    }

    const sortedRows = [...byUser.values()].sort((a, b) =>
      `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`),
    );

    return { from, to, rows: sortedRows };
  }

  async getCsv(from: string, to: string): Promise<string> {
    const summary = await this.getSummary(from, to);
    const activityTypes = Object.values(VolunteerActivityType);
    const lines = [
      ['firstName', 'lastName', 'approvedMinutes', 'pendingMinutes', ...activityTypes].join(','),
    ];

    for (const row of summary.rows) {
      lines.push(
        [
          csvCell(row.firstName),
          csvCell(row.lastName),
          String(row.approvedMinutes),
          String(row.pendingMinutes),
          ...activityTypes.map((type) => String(row.byActivityType[type] ?? 0)),
        ].join(','),
      );
    }

    return lines.join('\n');
  }
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
