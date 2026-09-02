import { Injectable, NotFoundException } from '@nestjs/common';
import {
  INEM_INOP_REASONS,
  INEMSessionStatus,
  INEMStatusOverview,
  INEMUnit as INEMUnitShape,
} from '@redinfo/shared';
import { INEMSessionStatus as PrismaINEMSessionStatus, Prisma } from '@prisma/client';
import { ApiConflictException } from '../common/api-error.exception';
import { PrismaService } from '../prisma/prisma.service';
import { InemSessionService } from './inem-session.service';

type INEMUnitRow = Prisma.INEMUnitGetPayload<{
  include: { vehicle: { select: { id: true; licensePlate: true; numeroCauda: true } } };
}>;

const UNIT_INCLUDE = {
  vehicle: { select: { id: true, licensePlate: true, numeroCauda: true } },
} as const;

/**
 * The public-facing half of the INEM integration (#214): the fleet-board
 * screen's `GET /inem/status` and a crew member's `PUT /inem/units/:unitId`.
 *
 * Neither route talks to INEM directly — writing `desiredInopCode` and an
 * audit row is the entire job of `setUnitStatus`; `InemReconcilerService`
 * does the pushing on its own schedule. A crew member sets a unit's status
 * and moves on; they never wait on a scraped SSO session.
 */
@Injectable()
export class InemService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly session: InemSessionService,
  ) {}

  async getStatusOverview(): Promise<INEMStatusOverview> {
    const [sessionOverview, units] = await Promise.all([
      this.session.getOverview(),
      this.prisma.iNEMUnit.findMany({ include: UNIT_INCLUDE, orderBy: { unitId: 'asc' } }),
    ]);

    return {
      sessionStatus: toSharedSessionStatus(sessionOverview.status),
      sessionLastError: sessionOverview.lastError,
      inopReasons: this.session.getCachedInopReasons() ?? INEM_INOP_REASONS,
      units: units.map(toUnitShape),
    };
  }

  async setUnitStatus(actor: { id: string }, unitId: string, inopCode: string): Promise<void> {
    const overview = await this.session.getOverview();
    if (overview.status === PrismaINEMSessionStatus.FAILED) {
      // The breaker has tripped — accepting more desired-state changes that
      // will never sync would be misleading. The status banner (#216) names
      // the manual fallback: set it directly in INEM's own portal.
      throw new ApiConflictException(
        'INEM_SESSION_NOT_ACTIVE',
        'The INEM integration is currently unavailable — set this unit’s status directly in the INEM portal instead.',
      );
    }

    const unit = await this.prisma.iNEMUnit.findUnique({ where: { unitId } });
    if (!unit) throw new NotFoundException(`INEM unit ${unitId} not found`);

    await this.prisma.$transaction([
      this.prisma.iNEMUnit.update({ where: { unitId }, data: { desiredInopCode: inopCode } }),
      this.prisma.iNEMStatusAudit.create({ data: { unitId, userId: actor.id, inopCode } }),
    ]);
  }
}

/**
 * Prisma's generated enum and the shared one are declared separately but
 * share every member name and value 1:1 — asserting here avoids an
 * exhaustive switch that would need to be kept in sync by hand for no
 * behavioural benefit. `notification-delivery.service.ts` does the same for
 * `NotificationChannel`.
 */
function toSharedSessionStatus(status: PrismaINEMSessionStatus): INEMSessionStatus {
  return status as unknown as INEMSessionStatus;
}

function toUnitShape(row: INEMUnitRow): INEMUnitShape {
  return {
    unitId: row.unitId,
    station: row.station,
    carId: row.carId,
    unitType: row.unitType,
    desiredInopCode: row.desiredInopCode,
    reportedInopCode: row.reportedInopCode,
    reportedActive: row.reportedActive,
    lastSyncedAt: row.lastSyncedAt ? row.lastSyncedAt.toISOString() : null,
    lastError: row.lastError,
    vehicle: row.vehicle,
  };
}
