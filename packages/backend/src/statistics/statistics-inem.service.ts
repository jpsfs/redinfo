import { Injectable } from '@nestjs/common';
import {
  INEM_AVAILABLE_INOP_CODE,
  INEMStatistics,
  StatisticsInemReasonMinutes,
  StatisticsInemUnit,
  StatisticsQuery,
} from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { InemService } from '../inem/inem.service';
import { addIsoDays, parseIsoDate } from '../utils/date.util';
import { diffMinutes, resolveStatisticsRange } from './statistics.util';

interface UnitAccumulator {
  unitId: string;
  vehicleId: string | null;
  availableMinutes: number;
  downtimeByReason: Map<string, number>;
}

/**
 * Tab 4 — how long each unit actually sat in each confirmed state, and why
 * (docs/plans/estatisticas-dashboards.md's sibling for the INEM integration,
 * #post-#216). Sourced entirely from `INEMUnitStatusPeriod`, the reconciler's
 * confirmed-state trail — never `INEMUnit.desiredInopCode`, which is intent,
 * not fact. Ungated, org-wide, like every other route on this controller.
 */
@Injectable()
export class StatisticsInemService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inem: InemService,
  ) {}

  async getStatistics(query: StatisticsQuery): Promise<INEMStatistics> {
    const { from, to } = resolveStatisticsRange(query.from, query.to);
    const rangeStart = parseIsoDate(from);
    const rangeEnd = parseIsoDate(addIsoDays(to, 1)); // exclusive — the instant after `to`'s day ends
    const now = new Date();

    const periods = await this.prisma.iNEMUnitStatusPeriod.findMany({
      where: {
        startedAt: { lt: rangeEnd },
        OR: [{ endedAt: null }, { endedAt: { gt: rangeStart } }],
      },
      select: { unitId: true, vehicleId: true, inopCode: true, startedAt: true, endedAt: true },
    });

    const byUnit = new Map<string, UnitAccumulator>();
    for (const period of periods) {
      const clippedStart = period.startedAt > rangeStart ? period.startedAt : rangeStart;
      const rawEnd = period.endedAt ?? now; // still-open period counts up to now, then gets clipped below
      const clippedEnd = rawEnd < rangeEnd ? rawEnd : rangeEnd;
      const minutes = Math.max(0, diffMinutes(clippedStart, clippedEnd));
      if (minutes === 0) continue;

      let acc = byUnit.get(period.unitId);
      if (!acc) {
        acc = { unitId: period.unitId, vehicleId: period.vehicleId, availableMinutes: 0, downtimeByReason: new Map() };
        byUnit.set(period.unitId, acc);
      }
      // A unit's vehicle link can change between periods (a re-plated unit,
      // or a fixed mismatch) — keep the most recent one. Good enough for a
      // display join, this isn't a per-period ledger of vehicle ownership.
      if (period.vehicleId) acc.vehicleId = period.vehicleId;

      if (period.inopCode === INEM_AVAILABLE_INOP_CODE) {
        acc.availableMinutes += minutes;
      } else {
        acc.downtimeByReason.set(period.inopCode, (acc.downtimeByReason.get(period.inopCode) ?? 0) + minutes);
      }
    }

    const reasonLabels = this.inem.getInopReasonLabels();
    const vehicleIds = [...byUnit.values()].map((u) => u.vehicleId).filter((id): id is string => id !== null);
    const vehicles = vehicleIds.length
      ? await this.prisma.vehicle.findMany({
          where: { id: { in: vehicleIds } },
          select: { id: true, licensePlate: true, numeroCauda: true },
        })
      : [];
    const vehicleById = new Map(vehicles.map((v) => [v.id, v]));

    const units: StatisticsInemUnit[] = [...byUnit.values()]
      .map((acc) => {
        const downtimeByReason = sortedReasonMinutes(acc.downtimeByReason, reasonLabels);
        return {
          unitId: acc.unitId,
          vehicle: acc.vehicleId ? (vehicleById.get(acc.vehicleId) ?? null) : null,
          availableMinutes: acc.availableMinutes,
          totalDowntimeMinutes: sumMinutes(downtimeByReason),
          downtimeByReason,
        };
      })
      .sort((a, b) => b.totalDowntimeMinutes - a.totalDowntimeMinutes);

    const globalByReason = new Map<string, number>();
    for (const unit of units) {
      for (const r of unit.downtimeByReason) {
        globalByReason.set(r.inopCode, (globalByReason.get(r.inopCode) ?? 0) + r.minutes);
      }
    }
    const downtimeByReason = sortedReasonMinutes(globalByReason, reasonLabels);

    return {
      from,
      to,
      totalDowntimeMinutes: sumMinutes(downtimeByReason),
      downtimeByReason,
      units,
    };
  }
}

function sortedReasonMinutes(
  byReason: Map<string, number>,
  labels: Record<string, string>,
): StatisticsInemReasonMinutes[] {
  return [...byReason.entries()]
    .map(([inopCode, minutes]) => ({ inopCode, label: labels[inopCode] ?? inopCode, minutes }))
    .sort((a, b) => b.minutes - a.minutes);
}

function sumMinutes(entries: StatisticsInemReasonMinutes[]): number {
  return entries.reduce((sum, e) => sum + e.minutes, 0);
}
