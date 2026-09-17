import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import {
  DEFAULT_DELEGATION_SETTINGS,
  DEFAULT_OCCURRENCE_TYPE_POLICIES,
  LegCancellationSource,
  LegDirection,
  LegStatus,
  TransportRequestOccurrenceType,
} from '@redinfo/shared';
import { TransportRequestLegsService } from './transport-request-legs.service';
import { PrismaService } from '../prisma/prisma.service';
import { DelegationSettingsService } from '../live-runs/delegation-settings.service';
import { OccurrenceTypePoliciesService } from '../transport-config/occurrence-type-policies.service';

// ── Treatment plans & transport legs (#230) ─────────────────────────────────
//
// The rule most likely to be got wrong, per the story's own acceptance
// criteria, is the generator's idempotency: re-running `generateForPlan`
// must never duplicate a leg, and must never resurrect one that has been
// cancelled, rescheduled or hand-edited. That's keyed off `generatedForDate`
// (frozen at creation), never `date` — see the service's own doc comments.

const REQUEST = {
  id: 'req-1',
  originAddress: 'Rua das Flores, 10',
  originLatitude: null,
  originLongitude: null,
  isRoundTrip: true,
  destinationFacilityId: 'fac-dest',
  appointmentAt: new Date('2026-09-14T09:00:00.000Z'),
};

const PLAN = {
  id: 'plan-1',
  transportRequestId: REQUEST.id,
  destinationFacilityId: 'fac-dest',
  // Monday only, across one week — 2026-09-14 and 2026-09-21 are Mondays.
  daysOfWeek: [1],
  validFrom: new Date('2026-09-14T00:00:00.000Z'),
  validTo: new Date('2026-09-21T00:00:00.000Z'),
  transportRequest: REQUEST,
};

const legRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'leg-1',
  transportRequestId: REQUEST.id,
  treatmentPlanId: null,
  date: new Date('2026-09-14T00:00:00.000Z'),
  generatedForDate: new Date('2026-09-14T00:00:00.000Z'),
  direction: LegDirection.OUTBOUND as string,
  originAddress: REQUEST.originAddress,
  originLatitude: null,
  originLongitude: null,
  originFacilityId: null,
  originFacility: null,
  destinationAddress: null,
  destinationLatitude: null,
  destinationLongitude: null,
  destinationFacilityId: REQUEST.destinationFacilityId,
  destinationFacility: null,
  plannedPickupAt: null,
  plannedDropoffAt: null,
  actualPickupAt: null,
  actualDropoffAt: null,
  status: LegStatus.PLANNED as string,
  cancellationReason: null,
  cancellationSource: null,
  estimatedEndAt: null,
  estimatedEndSource: null,
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  updatedAt: new Date('2026-09-01T00:00:00.000Z'),
  transportRequest: { occurrenceType: TransportRequestOccurrenceType.CONSULTA, appointmentAt: REQUEST.appointmentAt },
  treatmentPlan: null,
  ...overrides,
});

function makeService(prismaOverrides: Record<string, unknown> = {}) {
  const prisma = {
    treatmentPlan: {
      findUnique: jest.fn(() => Promise.resolve(PLAN)),
    },
    transportLeg: {
      findMany: jest.fn(() => Promise.resolve([])),
      createMany: jest.fn(() => Promise.resolve({ count: 0 })),
      findUnique: jest.fn(() => Promise.resolve(legRow())),
      update: jest.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve(legRow(args.data as never)),
      ),
      count: jest.fn(() => Promise.resolve(0)),
    },
    transportRequest: {
      findUnique: jest.fn(() => Promise.resolve(REQUEST)),
      count: jest.fn(() => Promise.resolve(1)),
    },
    facility: {
      count: jest.fn(() => Promise.resolve(1)),
    },
    ...prismaOverrides,
  } as unknown as PrismaService;

  const delegationSettings = {
    get: jest.fn(() => Promise.resolve(DEFAULT_DELEGATION_SETTINGS)),
  } as unknown as DelegationSettingsService;
  const occurrenceTypePolicies = {
    getEffectiveMap: jest.fn(() => Promise.resolve(DEFAULT_OCCURRENCE_TYPE_POLICIES)),
  } as unknown as OccurrenceTypePoliciesService;

  return {
    service: new TransportRequestLegsService(prisma, delegationSettings, occurrenceTypePolicies),
    prisma,
  };
}

describe('TransportRequestLegsService', () => {
  describe('generateForPlan', () => {
    it('materialises an outbound and a return leg for every Monday in the validity period', async () => {
      const { service, prisma } = makeService();

      const created = await service.generateForPlan(PLAN.id);

      expect(created).toBe(4); // 2026-09-14 and 2026-09-21, outbound + return each
      const rows = (prisma.transportLeg.createMany as jest.Mock).mock.calls[0][0].data as Array<
        Record<string, unknown>
      >;
      expect(rows).toHaveLength(4);
      expect(rows.filter((r) => r.direction === LegDirection.OUTBOUND)).toHaveLength(2);
      expect(rows.filter((r) => r.direction === LegDirection.RETURN)).toHaveLength(2);
      // Outbound goes address → facility; return goes facility → address.
      const outbound = rows.find((r) => r.direction === LegDirection.OUTBOUND)!;
      expect(outbound.originAddress).toBe(REQUEST.originAddress);
      expect(outbound.destinationFacilityId).toBe(PLAN.destinationFacilityId);
      const ret = rows.find((r) => r.direction === LegDirection.RETURN)!;
      expect(ret.originFacilityId).toBe(PLAN.destinationFacilityId);
      expect(ret.destinationAddress).toBe(REQUEST.originAddress);
    });

    it('generates outbound-only legs when the request is not a round trip', async () => {
      const oneWay = { ...REQUEST, isRoundTrip: false };
      const { service, prisma } = makeService({
        treatmentPlan: { findUnique: jest.fn(() => Promise.resolve({ ...PLAN, transportRequest: oneWay })) },
      });

      await service.generateForPlan(PLAN.id);

      const rows = (prisma.transportLeg.createMany as jest.Mock).mock.calls[0][0].data as Array<
        Record<string, unknown>
      >;
      expect(rows.every((r) => r.direction === LegDirection.OUTBOUND)).toBe(true);
      expect(rows).toHaveLength(2);
    });

    it('never duplicates or resurrects a leg already covering a generated slot, however it has since been edited', async () => {
      // One Monday's outbound leg already exists — rescheduled away from its
      // original slot (`date` moved) — and its return leg was cancelled.
      // Both still occupy their `generatedForDate` slot, so re-running must
      // skip both, not resurrect or duplicate either.
      const { service, prisma } = makeService({
        transportLeg: {
          findMany: jest.fn(() =>
            Promise.resolve([
              { generatedForDate: new Date('2026-09-14T00:00:00.000Z'), direction: LegDirection.OUTBOUND },
              { generatedForDate: new Date('2026-09-14T00:00:00.000Z'), direction: LegDirection.RETURN },
            ]),
          ),
          createMany: jest.fn(() => Promise.resolve({ count: 0 })),
        },
      });

      const created = await service.generateForPlan(PLAN.id);

      expect(created).toBe(2); // only 2026-09-21's outbound + return are new
      const rows = (prisma.transportLeg.createMany as jest.Mock).mock.calls[0][0].data as Array<
        Record<string, unknown>
      >;
      expect(rows.every((r) => (r.generatedForDate as Date).toISOString().slice(0, 10) === '2026-09-21')).toBe(true);
    });

    it('is a no-op call when every slot is already covered — no empty createMany call', async () => {
      const { service, prisma } = makeService({
        transportLeg: {
          findMany: jest.fn(() =>
            Promise.resolve([
              { generatedForDate: new Date('2026-09-14T00:00:00.000Z'), direction: LegDirection.OUTBOUND },
              { generatedForDate: new Date('2026-09-14T00:00:00.000Z'), direction: LegDirection.RETURN },
              { generatedForDate: new Date('2026-09-21T00:00:00.000Z'), direction: LegDirection.OUTBOUND },
              { generatedForDate: new Date('2026-09-21T00:00:00.000Z'), direction: LegDirection.RETURN },
            ]),
          ),
          createMany: jest.fn(() => Promise.resolve({ count: 0 })),
        },
      });

      const created = await service.generateForPlan(PLAN.id);

      expect(created).toBe(0);
      expect(prisma.transportLeg.createMany).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for an unknown plan', async () => {
      const { service } = makeService({ treatmentPlan: { findUnique: jest.fn(() => Promise.resolve(null)) } });
      await expect(service.generateForPlan('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('generateOneOff', () => {
    it('generates outbound + return legs dated on the appointment, with no plan above them', async () => {
      const { service, prisma } = makeService();

      const created = await service.generateOneOff(REQUEST.id);

      expect(created).toBe(2);
      const rows = (prisma.transportLeg.createMany as jest.Mock).mock.calls[0][0].data as Array<
        Record<string, unknown>
      >;
      for (const row of rows) {
        expect(row.treatmentPlanId).toBeNull();
        expect(row.date).toEqual(new Date('2026-09-14T00:00:00.000Z'));
      }
    });

    it('is idempotent — a referral already carrying an un-planned leg gets nothing new', async () => {
      const { service, prisma } = makeService({
        transportLeg: { count: jest.fn(() => Promise.resolve(1)), createMany: jest.fn() },
      });

      const created = await service.generateOneOff(REQUEST.id);

      expect(created).toBe(0);
      expect(prisma.transportLeg.createMany).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for an unknown request', async () => {
      const { service } = makeService({ transportRequest: { findUnique: jest.fn(() => Promise.resolve(null)) } });
      await expect(service.generateOneOff('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('findAllForRequest — effective policy (#233)', () => {
    it('falls back to appointment-plus-floor when no end time is supplied', async () => {
      const { service } = makeService({
        transportLeg: { findMany: jest.fn(() => Promise.resolve([legRow()])) },
      });

      const [leg] = await service.findAllForRequest(REQUEST.id);

      // CONSULTA's minimum is 30 minutes; the request's appointment is 09:00Z.
      expect(leg.estimatedEndAt).toBeNull();
      expect(leg.effectiveEstimatedEndAt).toBe('2026-09-14T09:30:00.000Z');
    });

    it("uses the leg's own supplied estimate over the floor", async () => {
      const { service } = makeService({
        transportLeg: {
          findMany: jest.fn(() =>
            Promise.resolve([legRow({ estimatedEndAt: new Date('2026-09-14T11:00:00.000Z') })]),
          ),
        },
      });

      const [leg] = await service.findAllForRequest(REQUEST.id);

      expect(leg.effectiveEstimatedEndAt).toBe('2026-09-14T11:00:00.000Z');
    });

    it('flags an outbound leg planned too early against the delegation default', async () => {
      const { service } = makeService({
        transportLeg: {
          findMany: jest.fn(() =>
            // 61 minutes before the 09:00Z appointment — over the 30-minute default.
            Promise.resolve([legRow({ plannedDropoffAt: new Date('2026-09-14T07:59:00.000Z') })]),
          ),
        },
      });

      const [leg] = await service.findAllForRequest(REQUEST.id);

      expect(leg.arrivalWindowWarning).toBe('TOO_EARLY');
    });

    it("a facility override wins over the delegation default, so the same plan is no longer flagged", async () => {
      const { service } = makeService({
        transportLeg: {
          findMany: jest.fn(() =>
            Promise.resolve([
              legRow({
                plannedDropoffAt: new Date('2026-09-14T07:59:00.000Z'),
                destinationFacility: {
                  arrivalWindowEarliestMinutesOverride: 90,
                  arrivalWindowLatestMinutesOverride: null,
                  arrivalToleranceMinutesOverride: null,
                  createdAt: new Date('2026-09-01T00:00:00.000Z'),
                  updatedAt: new Date('2026-09-01T00:00:00.000Z'),
                },
              }),
            ]),
          ),
        },
      });

      const [leg] = await service.findAllForRequest(REQUEST.id);

      expect(leg.arrivalWindowWarning).toBeNull();
    });

    it('never flags a return leg — there is no treatment start to be on time for', async () => {
      const { service } = makeService({
        transportLeg: {
          findMany: jest.fn(() =>
            Promise.resolve([
              legRow({
                direction: LegDirection.RETURN,
                plannedDropoffAt: new Date('2026-09-14T07:59:00.000Z'),
              }),
            ]),
          ),
        },
      });

      const [leg] = await service.findAllForRequest(REQUEST.id);

      expect(leg.arrivalWindowWarning).toBeNull();
    });
  });

  describe('update', () => {
    it('refuses to edit a cancelled leg', async () => {
      const { service } = makeService({
        transportLeg: { findUnique: jest.fn(() => Promise.resolve(legRow({ status: LegStatus.CANCELLED }))) },
      });
      await expect(service.update('leg-1', {})).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects mismatched destination latitude/longitude', async () => {
      const { service } = makeService();
      await expect(service.update('leg-1', { destinationLatitude: 41.5 })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects a facility id that does not exist', async () => {
      const { service } = makeService({ facility: { count: jest.fn(() => Promise.resolve(0)) } });
      await expect(service.update('leg-1', { originFacilityId: 'missing-fac' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('reschedules by moving date, without touching generatedForDate', async () => {
      const { service, prisma } = makeService();

      await service.update('leg-1', { date: '2026-09-15' });

      const data = (prisma.transportLeg.update as jest.Mock).mock.calls[0][0].data;
      expect(data.date).toEqual(new Date('2026-09-15T00:00:00.000Z'));
      expect(data).not.toHaveProperty('generatedForDate');
    });
  });

  describe('cancel', () => {
    it('records the reason and source, and never touches the plan above it', async () => {
      const { service, prisma } = makeService({
        transportLeg: {
          findUnique: jest.fn(() => Promise.resolve(legRow({ treatmentPlanId: PLAN.id }))),
          update: jest.fn((args: { data: Record<string, unknown> }) => Promise.resolve(legRow(args.data as never))),
        },
      });

      await service.cancel('leg-1', { reason: 'Patient admitted', source: LegCancellationSource.PATIENT });

      const data = (prisma.transportLeg.update as jest.Mock).mock.calls[0][0].data;
      expect(data.status).toBe(LegStatus.CANCELLED);
      expect(data.cancellationReason).toBe('Patient admitted');
      expect(data.cancellationSource).toBe(LegCancellationSource.PATIENT);
      expect((prisma.transportLeg.update as jest.Mock).mock.calls[0][0]).not.toHaveProperty('treatmentPlanId');
    });

    it('refuses to cancel an already-cancelled leg', async () => {
      const { service } = makeService({
        transportLeg: { findUnique: jest.fn(() => Promise.resolve(legRow({ status: LegStatus.CANCELLED }))) },
      });
      await expect(
        service.cancel('leg-1', { reason: 'x', source: LegCancellationSource.PATIENT }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses to cancel a completed leg', async () => {
      const { service } = makeService({
        transportLeg: { findUnique: jest.fn(() => Promise.resolve(legRow({ status: LegStatus.COMPLETED }))) },
      });
      await expect(
        service.cancel('leg-1', { reason: 'x', source: LegCancellationSource.PATIENT }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects an empty reason', async () => {
      const { service } = makeService();
      await expect(service.cancel('leg-1', { reason: '  ', source: LegCancellationSource.PATIENT })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('markNoShow', () => {
    it.each([LegStatus.PLANNED, LegStatus.ASSIGNED])('marks a %s leg as a no-show', async (status) => {
      const { service, prisma } = makeService({
        transportLeg: {
          findUnique: jest.fn(() => Promise.resolve(legRow({ status }))),
          update: jest.fn((args: { data: Record<string, unknown> }) => Promise.resolve(legRow(args.data as never))),
        },
      });

      await service.markNoShow('leg-1');

      expect((prisma.transportLeg.update as jest.Mock).mock.calls[0][0].data.status).toBe(LegStatus.NO_SHOW);
    });

    it.each([LegStatus.COMPLETED, LegStatus.CANCELLED, LegStatus.NO_SHOW])(
      'refuses to mark a %s leg as a no-show',
      async (status) => {
        const { service } = makeService({
          transportLeg: { findUnique: jest.fn(() => Promise.resolve(legRow({ status }))) },
        });
        await expect(service.markNoShow('leg-1')).rejects.toBeInstanceOf(ConflictException);
      },
    );
  });

  // ── Planning board queries (#235) ───────────────────────────────────────

  describe('findUnassignedForDate', () => {
    it('asks Prisma to exclude cancelled/no-show legs and legs with any TripStop', async () => {
      const findMany: jest.Mock = jest.fn(() => Promise.resolve([legRow()]));
      const { service } = makeService({ transportLeg: { findMany } });

      const legs = await service.findUnassignedForDate('2026-09-14');

      expect(legs).toHaveLength(1);
      const where = findMany.mock.calls[0][0].where;
      expect(where.status).toEqual({ notIn: [LegStatus.CANCELLED, LegStatus.NO_SHOW] });
      expect(where.tripStops).toEqual({ none: {} });
    });
  });

  describe('findByIds', () => {
    it('short-circuits to an empty array without touching the database', async () => {
      const findMany = jest.fn();
      const { service } = makeService({ transportLeg: { findMany } });

      expect(await service.findByIds([])).toEqual([]);
      expect(findMany).not.toHaveBeenCalled();
    });

    it('looks legs up by id', async () => {
      const findMany: jest.Mock = jest.fn(() => Promise.resolve([legRow({ id: 'leg-9' })]));
      const { service } = makeService({ transportLeg: { findMany } });

      const [leg] = await service.findByIds(['leg-9']);

      expect(leg.id).toBe('leg-9');
      expect(findMany.mock.calls[0][0].where).toEqual({ id: { in: ['leg-9'] } });
    });
  });
});
