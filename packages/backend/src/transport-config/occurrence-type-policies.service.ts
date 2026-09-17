import { Injectable } from '@nestjs/common';
import {
  DEFAULT_OCCURRENCE_TYPE_POLICIES,
  OccurrenceTypePolicy,
  OccurrenceTypePolicyInput,
  TransportRequestOccurrenceType,
} from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';

type OccurrenceTypePolicyRow = {
  occurrenceType: string;
  minimumDurationMinutes: number;
  defaultDurationMinutes: number;
  updatedAt: Date;
};

function serialize(row: OccurrenceTypePolicyRow): OccurrenceTypePolicy {
  return {
    occurrenceType: row.occurrenceType as TransportRequestOccurrenceType,
    minimumDurationMinutes: row.minimumDurationMinutes,
    defaultDurationMinutes: row.defaultDurationMinutes,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * The duration floor/default per `TransportRequestOccurrenceType` (#233) — a
 * fixed set of rows, one per enum value, seeded by the migration the same
 * way `DelegationSettings`' singleton row is. `findAll` fills in
 * `DEFAULT_OCCURRENCE_TYPE_POLICIES` for any type the table is missing a row
 * for — the one case the migration's seed cannot cover, a fresh test
 * database built by `prisma db push` — so "every occurrence type has a
 * minimum and a default duration" holds structurally, not just when the
 * migration has run.
 */
@Injectable()
export class OccurrenceTypePoliciesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<OccurrenceTypePolicy[]> {
    const rows = await this.prisma.occurrenceTypePolicy.findMany();
    const byType = new Map(rows.map((row) => [row.occurrenceType, row]));
    const now = new Date();

    return Object.values(TransportRequestOccurrenceType).map((occurrenceType) => {
      const row = byType.get(occurrenceType);
      if (row) return serialize(row);
      return { occurrenceType, ...DEFAULT_OCCURRENCE_TYPE_POLICIES[occurrenceType], updatedAt: now.toISOString() };
    });
  }

  /** Same "every type is present" guarantee as `findAll`, as a lookup map —
   * what `resolveEstimatedEnd`'s callers actually need. */
  async getEffectiveMap(): Promise<Record<TransportRequestOccurrenceType, OccurrenceTypePolicyInput>> {
    const all = await this.findAll();
    return Object.fromEntries(
      all.map(({ occurrenceType, minimumDurationMinutes, defaultDurationMinutes }) => [
        occurrenceType,
        { minimumDurationMinutes, defaultDurationMinutes },
      ]),
    ) as Record<TransportRequestOccurrenceType, OccurrenceTypePolicyInput>;
  }

  /** Upsert: every occurrence type's row always exists by the time a
   * coordinator edits it (seeded), but upserting keeps this correct even
   * against the `db push` fallback case `findAll` covers. */
  async update(
    occurrenceType: TransportRequestOccurrenceType,
    input: OccurrenceTypePolicyInput,
  ): Promise<OccurrenceTypePolicy> {
    const row = await this.prisma.occurrenceTypePolicy.upsert({
      where: { occurrenceType },
      create: { occurrenceType, ...input },
      update: input,
    });
    return serialize(row);
  }
}
