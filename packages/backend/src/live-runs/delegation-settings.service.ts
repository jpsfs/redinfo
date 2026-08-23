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
    };
  }

  /** Upsert, because the row is a singleton and its absence is not an error. */
  async update(settings: DelegationSettings): Promise<DelegationSettings> {
    const row = await this.prisma.delegationSettings.upsert({
      where: { id: DelegationSettingsService.ROW_ID },
      create: { id: DelegationSettingsService.ROW_ID, ...settings },
      update: settings,
    });
    return {
      baseName: row.baseName,
      baseLatitude: row.baseLatitude,
      baseLongitude: row.baseLongitude,
      coduDadosPhone: row.coduDadosPhone,
    };
  }
}
