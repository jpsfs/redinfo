import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TransportRequestTreatmentPlansService } from './transport-request-treatment-plans.service';
import { TransportRequestLegsService } from './transport-request-legs.service';
import { PrismaService } from '../prisma/prisma.service';

// ── Treatment plans & transport legs (#230) ─────────────────────────────────
//
// `TreatmentPlan` CRUD is the generator, never the durable record — the one
// behaviour worth locking down here beyond ordinary validation is that
// create/update always re-runs the leg generator afterwards, unconditionally,
// since `generateForPlan` is idempotent by design.

const PLAN_ROW = {
  id: 'plan-1',
  transportRequestId: 'req-1',
  destinationFacilityId: 'fac-1',
  daysOfWeek: [1, 3],
  treatmentStartTime: '09:00',
  treatmentEndTime: '11:00',
  validFrom: new Date('2026-09-14T00:00:00.000Z'),
  validTo: new Date('2026-10-14T00:00:00.000Z'),
  notes: null,
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  updatedAt: new Date('2026-09-01T00:00:00.000Z'),
};

const validDto = () => ({
  destinationFacilityId: 'fac-1',
  daysOfWeek: [3, 1], // deliberately unsorted
  treatmentStartTime: '09:00',
  treatmentEndTime: '11:00',
  validFrom: '2026-09-14',
  validTo: '2026-10-14',
});

function makeService(prismaOverrides: Record<string, unknown> = {}) {
  const prisma = {
    transportRequest: { count: jest.fn(() => Promise.resolve(1)) },
    treatmentPlan: {
      findMany: jest.fn(() => Promise.resolve([PLAN_ROW])),
      findUnique: jest.fn(() => Promise.resolve(PLAN_ROW)),
      create: jest.fn((args: { data: Record<string, unknown> }) => Promise.resolve({ ...PLAN_ROW, ...args.data })),
      update: jest.fn((args: { data: Record<string, unknown> }) => Promise.resolve({ ...PLAN_ROW, ...args.data })),
    },
    facility: { count: jest.fn(() => Promise.resolve(1)) },
    ...prismaOverrides,
  } as unknown as PrismaService;

  const legs = { generateForPlan: jest.fn(() => Promise.resolve(0)) } as unknown as TransportRequestLegsService;

  return { service: new TransportRequestTreatmentPlansService(prisma, legs), prisma, legs };
}

describe('TransportRequestTreatmentPlansService', () => {
  describe('findAllForRequest', () => {
    it('throws NotFoundException for an unknown request', async () => {
      const { service } = makeService({ transportRequest: { count: jest.fn(() => Promise.resolve(0)) } });
      await expect(service.findAllForRequest('missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the request’s plans', async () => {
      const { service } = makeService();
      const plans = await service.findAllForRequest('req-1');
      expect(plans).toHaveLength(1);
      expect(plans[0].id).toBe('plan-1');
    });
  });

  describe('create', () => {
    it('sorts daysOfWeek, creates the plan and regenerates its legs', async () => {
      const { service, prisma, legs } = makeService();

      const created = await service.create('req-1', validDto() as never);

      expect((prisma.treatmentPlan.create as jest.Mock).mock.calls[0][0].data.daysOfWeek).toEqual([1, 3]);
      expect(legs.generateForPlan).toHaveBeenCalledWith(created.id);
    });

    it('rejects invalid input without creating anything', async () => {
      const { service, prisma, legs } = makeService();

      await expect(
        service.create('req-1', { ...validDto(), daysOfWeek: [] } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.treatmentPlan.create).not.toHaveBeenCalled();
      expect(legs.generateForPlan).not.toHaveBeenCalled();
    });

    it('rejects a destination facility that does not exist', async () => {
      const { service, prisma } = makeService({ facility: { count: jest.fn(() => Promise.resolve(0)) } });
      await expect(service.create('req-1', validDto() as never)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.treatmentPlan.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for an unknown request', async () => {
      const { service } = makeService({ transportRequest: { count: jest.fn(() => Promise.resolve(0)) } });
      await expect(service.create('missing', validDto() as never)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('merges the partial DTO onto the current row and regenerates legs', async () => {
      const { service, prisma, legs } = makeService();

      await service.update('plan-1', { treatmentEndTime: '12:00' } as never);

      const data = (prisma.treatmentPlan.update as jest.Mock).mock.calls[0][0].data;
      expect(data.treatmentEndTime).toBe('12:00');
      expect(data.destinationFacilityId).toBe(PLAN_ROW.destinationFacilityId); // unchanged fields survive
      expect(legs.generateForPlan).toHaveBeenCalledWith('plan-1');
    });

    it('only re-checks facility existence when the facility actually changed', async () => {
      const facilityCount = jest.fn(() => Promise.resolve(1));
      const { service } = makeService({ facility: { count: facilityCount } });

      await service.update('plan-1', { treatmentEndTime: '12:00' } as never);

      expect(facilityCount).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for an unknown plan', async () => {
      const { service } = makeService({ treatmentPlan: { findUnique: jest.fn(() => Promise.resolve(null)) } });
      await expect(service.update('missing', {} as never)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
