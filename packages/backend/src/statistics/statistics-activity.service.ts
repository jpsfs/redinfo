import { Injectable } from '@nestjs/common';
import {
  ActivityStatistics,
  EventReportType,
  InemSupportUnitType,
  StatisticsHospitalCount,
  StatisticsLocalityCount,
  StatisticsQuery,
  VictimDestinationKind,
} from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { parseIsoDate } from '../utils/date.util';
import { lisbonWeekdayAndBand, monthKey, monthRange, previousPeriodRange, resolveStatisticsRange } from './statistics.util';

const TOP_N = 10;

/** Tab 2 — Atividade (docs/plans/estatisticas-dashboards.md §3). Ungated, org-wide. */
@Injectable()
export class StatisticsActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatistics(query: StatisticsQuery): Promise<ActivityStatistics> {
    const { from, to } = resolveStatisticsRange(query.from, query.to);
    const { from: prevFrom, to: prevTo } = previousPeriodRange(from, to);
    const typeFilter = query.type ? { type: query.type } : {};

    const [reports, previousPeriodEvents] = await Promise.all([
      this.prisma.eventReport.findMany({
        where: {
          submittedAt: { not: null },
          occurredOn: { gte: parseIsoDate(from), lte: parseIsoDate(to) },
          ...typeFilter,
        },
        select: {
          type: true,
          occurredOn: true,
          activationAt: true,
          startedAt: true,
          locality: {
            select: {
              id: true,
              name: true,
              municipality: { select: { id: true, name: true } },
            },
          },
          victims: {
            select: {
              destinationKind: true,
              destinationHospital: {
                select: { id: true, name: true, municipality: { select: { name: true } } },
              },
            },
          },
          inemSupportUnits: {
            select: { unitType: true, hospital: { select: { name: true } } },
          },
        },
      }),
      this.prisma.eventReport.count({
        where: {
          submittedAt: { not: null },
          occurredOn: { gte: parseIsoDate(prevFrom), lte: parseIsoDate(prevTo) },
          ...typeFilter,
        },
      }),
    ]);

    const eventsByTypeMap = new Map<EventReportType, number>();
    const months = monthRange(from, to);
    const monthlyByType = new Map<string, Record<EventReportType, number>>(
      months.map((month) => [month, { EMERGENCY: 0, LOCAL_SUPPORT: 0, SALOP_SUPPORT: 0 }]),
    );
    const localityCounts = new Map<string, StatisticsLocalityCount>();
    const municipalityCounts = new Map<string, StatisticsLocalityCount>();
    const heatmap = new Map<string, number>(); // `${weekday}:${band}`
    const hospitalCounts = new Map<string, StatisticsHospitalCount>();
    const outcomeCounts = new Map<VictimDestinationKind, number>();
    const inemCounts = new Map<string, { unitType: InemSupportUnitType; hospitalName: string; count: number }>();
    let victimsAssisted = 0;

    for (const report of reports) {
      const type = report.type as EventReportType;
      eventsByTypeMap.set(type, (eventsByTypeMap.get(type) ?? 0) + 1);

      const month = monthKey(report.occurredOn);
      const bucket = monthlyByType.get(month);
      if (bucket) bucket[type] += 1;

      const locality = localityCounts.get(report.locality.id) ?? {
        id: report.locality.id,
        name: report.locality.name,
        count: 0,
      };
      locality.count += 1;
      localityCounts.set(report.locality.id, locality);

      const municipality = municipalityCounts.get(report.locality.municipality.id) ?? {
        id: report.locality.municipality.id,
        name: report.locality.municipality.name,
        count: 0,
      };
      municipality.count += 1;
      municipalityCounts.set(report.locality.municipality.id, municipality);

      if (type === EventReportType.EMERGENCY) {
        const activationInstant = report.activationAt ?? report.startedAt;
        const { weekday, band } = lisbonWeekdayAndBand(activationInstant);
        const key = `${weekday}:${band}`;
        heatmap.set(key, (heatmap.get(key) ?? 0) + 1);
      }

      for (const victim of report.victims) {
        victimsAssisted += 1;
        const destinationKind = victim.destinationKind as VictimDestinationKind;
        outcomeCounts.set(destinationKind, (outcomeCounts.get(destinationKind) ?? 0) + 1);
        if (victim.destinationHospital) {
          const hospital = hospitalCounts.get(victim.destinationHospital.id) ?? {
            id: victim.destinationHospital.id,
            name: victim.destinationHospital.name,
            municipality: victim.destinationHospital.municipality.name,
            count: 0,
          };
          hospital.count += 1;
          hospitalCounts.set(victim.destinationHospital.id, hospital);
        }
      }

      for (const unit of report.inemSupportUnits) {
        const unitType = unit.unitType as InemSupportUnitType;
        const key = `${unitType}:${unit.hospital.name}`;
        const entry = inemCounts.get(key) ?? { unitType, hospitalName: unit.hospital.name, count: 0 };
        entry.count += 1;
        inemCounts.set(key, entry);
      }
    }

    const { top: eventsByLocality, other: eventsByLocalityOther } = topNWithRest(localityCounts.values(), TOP_N);
    const { top: eventsByMunicipality, other: eventsByMunicipalityOther } = topNWithRest(
      municipalityCounts.values(),
      TOP_N,
    );

    const activationHeatmap = [...heatmap.entries()].map(([key, count]) => {
      const [weekday, band] = key.split(':').map(Number);
      return { weekday, band, count };
    });

    return {
      from,
      to,
      totalEvents: reports.length,
      previousPeriodEvents,
      victimsAssisted,
      eventsByType: Object.values(EventReportType).map((type) => ({
        type,
        count: eventsByTypeMap.get(type) ?? 0,
      })),
      eventsByMonth: months.map((month) => {
        const byType = monthlyByType.get(month)!;
        return { month, byType, total: byType.EMERGENCY + byType.LOCAL_SUPPORT + byType.SALOP_SUPPORT };
      }),
      activationHeatmap,
      eventsByLocality,
      eventsByLocalityOther,
      eventsByMunicipality,
      eventsByMunicipalityOther,
      destinationHospitals: [...hospitalCounts.values()].sort((a, b) => b.count - a.count),
      victimOutcomes: Object.values(VictimDestinationKind).map((kind) => ({
        kind,
        count: outcomeCounts.get(kind) ?? 0,
      })),
      inemUnits: [...inemCounts.values()].sort((a, b) => b.count - a.count),
    };
  }
}

function topNWithRest(
  values: Iterable<StatisticsLocalityCount>,
  n: number,
): { top: StatisticsLocalityCount[]; other: number } {
  const sorted = [...values].sort((a, b) => b.count - a.count);
  const top = sorted.slice(0, n);
  const other = sorted.slice(n).reduce((sum, v) => sum + v.count, 0);
  return { top, other };
}
