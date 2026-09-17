import { Injectable } from '@nestjs/common';
import {
  EventReportType,
  FleetStatistics,
  ResponseLegKey,
  RESPONSE_LEG_KEYS,
  StatisticsFleetVehicle,
  StatisticsQuery,
} from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { parseIsoDate } from '../utils/date.util';
import { diffMinutes, median, monthKey, monthRange, percentile, resolveStatisticsRange } from './statistics.util';

/** `(start, end)` field names for each gap between two chronology stamps. */
const LEG_FIELDS: Record<ResponseLegKey, ['activationAt' | 'sceneArrivalAt' | 'sceneDepartureAt' | 'hospitalArrivalAt', 'sceneArrivalAt' | 'sceneDepartureAt' | 'hospitalArrivalAt' | 'availableAt']> = {
  [ResponseLegKey.ACTIVATION_TO_SCENE]: ['activationAt', 'sceneArrivalAt'],
  [ResponseLegKey.ON_SCENE]: ['sceneArrivalAt', 'sceneDepartureAt'],
  [ResponseLegKey.SCENE_TO_HOSPITAL]: ['sceneDepartureAt', 'hospitalArrivalAt'],
  [ResponseLegKey.HOSPITAL_TO_AVAILABLE]: ['hospitalArrivalAt', 'availableAt'],
};

/** Tab 3 — Frota & Resposta (docs/plans/estatisticas-dashboards.md §4). Ungated, org-wide. */
@Injectable()
export class StatisticsFleetService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatistics(query: StatisticsQuery): Promise<FleetStatistics> {
    const { from, to } = resolveStatisticsRange(query.from, query.to);
    const typeFilter = query.type ? { type: query.type } : {};
    const months = monthRange(from, to);

    const vehicleRows = await this.prisma.eventReportVehicle.findMany({
      where: {
        report: {
          submittedAt: { not: null },
          occurredOn: { gte: parseIsoDate(from), lte: parseIsoDate(to) },
          ...typeFilter,
        },
      },
      select: {
        vehicleId: true,
        kilometres: true,
        reportId: true,
        report: { select: { occurredOn: true } },
        vehicle: { select: { numeroCauda: true, licensePlate: true } },
      },
    });

    const totalKilometres = vehicleRows.reduce((sum, r) => sum + r.kilometres, 0);

    const perReportKm = new Map<string, number>();
    for (const row of vehicleRows) {
      perReportKm.set(row.reportId, (perReportKm.get(row.reportId) ?? 0) + row.kilometres);
    }
    const perReportKmValues = [...perReportKm.values()];
    const eventCount = perReportKmValues.length;
    const kmPerEventMean = eventCount > 0 ? round1(totalKilometres / eventCount) : 0;
    const kmPerEventMedian = round1(median(perReportKmValues) ?? 0);

    const vehicleTotals = new Map<string, { numeroCauda: string; licensePlate: string; total: number; monthly: Map<string, number> }>();
    for (const row of vehicleRows) {
      let entry = vehicleTotals.get(row.vehicleId);
      if (!entry) {
        entry = {
          numeroCauda: row.vehicle.numeroCauda,
          licensePlate: row.vehicle.licensePlate,
          total: 0,
          monthly: new Map(),
        };
        vehicleTotals.set(row.vehicleId, entry);
      }
      entry.total += row.kilometres;
      const month = monthKey(row.report.occurredOn);
      entry.monthly.set(month, (entry.monthly.get(month) ?? 0) + row.kilometres);
    }

    const vehicles: StatisticsFleetVehicle[] = [...vehicleTotals.entries()]
      .map(([vehicleId, v]) => ({
        vehicleId,
        numeroCauda: v.numeroCauda,
        licensePlate: v.licensePlate,
        totalKilometres: v.total,
        monthlyKilometres: months.map((month) => ({ month, value: v.monthly.get(month) ?? 0 })),
      }))
      .sort((a, b) => b.totalKilometres - a.totalKilometres);

    // Chronology stamps only exist on EMERGENCY reports. A `type` filter for
    // anything else makes this section correctly, honestly empty rather than
    // silently ignoring the filter.
    const emergencyReports =
      query.type && query.type !== EventReportType.EMERGENCY
        ? []
        : await this.prisma.eventReport.findMany({
            where: {
              type: EventReportType.EMERGENCY,
              submittedAt: { not: null },
              occurredOn: { gte: parseIsoDate(from), lte: parseIsoDate(to) },
            },
            select: {
              activationAt: true,
              sceneArrivalAt: true,
              sceneDepartureAt: true,
              hospitalArrivalAt: true,
              availableAt: true,
            },
          });

    const responseLegs = RESPONSE_LEG_KEYS.map((leg) => {
      const [startField, endField] = LEG_FIELDS[leg];
      const durations = emergencyReports
        .filter((r) => r[startField] && r[endField])
        .map((r) => diffMinutes(r[startField] as Date, r[endField] as Date));
      return {
        leg,
        medianMinutes: median(durations),
        p90Minutes: percentile(durations, 0.9),
        sampleSize: durations.length,
      };
    });

    const totalDurations = emergencyReports
      .filter((r) => r.activationAt && r.availableAt)
      .map((r) => diffMinutes(r.activationAt as Date, r.availableAt as Date));

    return {
      from,
      to,
      totalKilometres,
      eventCount,
      kmPerEventMean,
      kmPerEventMedian,
      vehicles,
      responseLegs,
      totalDurationMedianMinutes: median(totalDurations),
      timedEmergencies: totalDurations.length,
      totalEmergencies: emergencyReports.length,
    };
  }
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
