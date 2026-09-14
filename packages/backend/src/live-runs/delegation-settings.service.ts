import { Injectable } from '@nestjs/common';
import { DEFAULT_DELEGATION_SETTINGS, DelegationSettings } from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The delegation's own configuration — its base, and the CODU Dados number.
 *
 * A table rather than environment variables, so a coordinator can change the
 * freephone number without a deploy, and so "where is our base" has one answer
 * that the distance calculation and the reports both read.
 *
 * Exactly one row, with a fixed id, seeded by the migration. The fallback to
 * `DEFAULT_DELEGATION_SETTINGS` exists for the one case the seed cannot cover —
 * a fresh test database built by `prisma db push`, which applies the schema
 * without the migration's data. It is deliberately the same values.
 */
@Injectable()
export class DelegationSettingsService {
  static readonly ROW_ID = 'delegation';

  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<DelegationSettings> {
    const row = await this.prisma.delegationSettings.findUnique({
      where: { id: DelegationSettingsService.ROW_ID },
    });
    if (!row) return DEFAULT_DELEGATION_SETTINGS;

    return {
      baseName: row.baseName,
      baseLatitude: row.baseLatitude,
      baseLongitude: row.baseLongitude,
      coduDadosPhone: row.coduDadosPhone,
      arrivalWindowEarliestMinutes: row.arrivalWindowEarliestMinutes,
      arrivalWindowLatestMinutes: row.arrivalWindowLatestMinutes,
      arrivalToleranceMinutes: row.arrivalToleranceMinutes,
    };
  }

  /**
   * A patch merged onto the current row, not a full replace — upsert because
   * the row is a singleton and its absence is not an error. Merging (rather
   * than requiring every field) is what lets the emergency-config screen
   * (base/CODU fields) and the transport-config screen (arrival window
   * thresholds, #233) each write only the slice they own without clobbering
   * the other's.
   */
  async update(patch: Partial<DelegationSettings>): Promise<DelegationSettings> {
    const merged: DelegationSettings = { ...(await this.get()), ...patch };
    const row = await this.prisma.delegationSettings.upsert({
      where: { id: DelegationSettingsService.ROW_ID },
      create: { id: DelegationSettingsService.ROW_ID, ...merged },
      update: merged,
    });
    return {
      baseName: row.baseName,
      baseLatitude: row.baseLatitude,
      baseLongitude: row.baseLongitude,
      coduDadosPhone: row.coduDadosPhone,
      arrivalWindowEarliestMinutes: row.arrivalWindowEarliestMinutes,
      arrivalWindowLatestMinutes: row.arrivalWindowLatestMinutes,
      arrivalToleranceMinutes: row.arrivalToleranceMinutes,
    };
  }
}
