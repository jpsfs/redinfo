import { DEFAULT_OCCURRENCE_TYPE_POLICIES, TransportRequestOccurrenceType } from '@redinfo/shared';
import { OccurrenceTypePoliciesService } from './occurrence-type-policies.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * `findAll`'s own fallback (#233) is what stands in for the "seeded by
 * migration" guarantee against a `db push` test database — see the
 * service's own doc comment, same reasoning as `DelegationSettingsService`.
 */
function makeService(rows: Array<{ occurrenceType: string; minimumDurationMinutes: number; defaultDurationMinutes: number; updatedAt: Date }> = []) {
  const prisma = {
    occurrenceTypePolicy: {
      findMany: jest.fn(() => Promise.resolve(rows)),
      upsert: jest.fn(({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) =>
        Promise.resolve({ ...create, ...update, updatedAt: new Date('2026-09-14T00:00:00.000Z') }),
      ),
    },
  } as unknown as PrismaService;
  return { service: new OccurrenceTypePoliciesService(prisma), prisma };
}

describe('OccurrenceTypePoliciesService', () => {
  describe('findAll', () => {
    it('returns every occurrence type even when the table is empty', async () => {
      const { service } = makeService([]);
      const policies = await service.findAll();
      expect(policies.map((p) => p.occurrenceType).sort()).toEqual(
        Object.values(TransportRequestOccurrenceType).sort(),
      );
      for (const policy of policies) {
        expect(policy.minimumDurationMinutes).toBeGreaterThan(0);
        expect(policy.defaultDurationMinutes).toBeGreaterThanOrEqual(policy.minimumDurationMinutes);
      }
    });

    it("prefers a persisted row over the default for the type it covers", async () => {
      const { service } = makeService([
        {
          occurrenceType: TransportRequestOccurrenceType.CONSULTA,
          minimumDurationMinutes: 45,
          defaultDurationMinutes: 45,
          updatedAt: new Date('2026-09-10T00:00:00.000Z'),
        },
      ]);
      const policies = await service.findAll();
      const consulta = policies.find((p) => p.occurrenceType === TransportRequestOccurrenceType.CONSULTA)!;
      expect(consulta.minimumDurationMinutes).toBe(45);
      const outro = policies.find((p) => p.occurrenceType === TransportRequestOccurrenceType.OUTRO)!;
      expect(outro.minimumDurationMinutes).toBe(DEFAULT_OCCURRENCE_TYPE_POLICIES.OUTRO.minimumDurationMinutes);
    });
  });

  describe('getEffectiveMap', () => {
    it('reduces findAll into a lookup keyed by occurrence type', async () => {
      const { service } = makeService([]);
      const map = await service.getEffectiveMap();
      expect(map[TransportRequestOccurrenceType.TRATAMENTO]).toEqual(
        DEFAULT_OCCURRENCE_TYPE_POLICIES[TransportRequestOccurrenceType.TRATAMENTO],
      );
    });
  });

  describe('update', () => {
    it('upserts by occurrence type', async () => {
      const { service, prisma } = makeService();
      await service.update(TransportRequestOccurrenceType.EXAME, {
        minimumDurationMinutes: 20,
        defaultDurationMinutes: 40,
      });
      expect(prisma.occurrenceTypePolicy.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { occurrenceType: TransportRequestOccurrenceType.EXAME } }),
      );
    });
  });
});
