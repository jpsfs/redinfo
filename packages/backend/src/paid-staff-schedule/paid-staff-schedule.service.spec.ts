import { NotFoundException } from '@nestjs/common';
import { ApiBadRequestException } from '../common/api-error.exception';
import { PaidStaffScheduleService } from './paid-staff-schedule.service';

const USER_ID = 'u-tiago';
const CREATED_BY = 'u-coordinator';

function buildPrismaStub(overrides: Record<string, unknown> = {}) {
  return {
    paidStaffSchedule: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((args) => Promise.resolve({ id: 'b1', ...args.data })),
      delete: jest.fn().mockResolvedValue({ id: 'b1' }),
    },
    paidStaffScheduleOverride: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockImplementation((args) =>
        Promise.resolve({ id: 'o1', userId: args.where.userId_date.userId, date: args.where.userId_date.date, ...args.create, ...args.update }),
      ),
      delete: jest.fn().mockResolvedValue({ id: 'o1' }),
    },
    ...overrides,
  };
}

const blockDto = (overrides: Partial<{ dayOfWeek: number; startMinute: number; endMinute: number; effectiveFrom: string; effectiveTo?: string }> = {}) => ({
  dayOfWeek: 1,
  startMinute: 8 * 60,
  endMinute: 16 * 60,
  effectiveFrom: '2026-01-01',
  ...overrides,
});

describe('PaidStaffScheduleService', () => {
  let service: PaidStaffScheduleService;
  let prisma: ReturnType<typeof buildPrismaStub>;

  beforeEach(() => {
    prisma = buildPrismaStub();
    service = new PaidStaffScheduleService(prisma as never);
  });

  describe('addBlock', () => {
    it('rejects a block that ends before it starts', async () => {
      await expect(
        service.addBlock(USER_ID, blockDto({ startMinute: 16 * 60, endMinute: 8 * 60 }), CREATED_BY),
      ).rejects.toBeInstanceOf(ApiBadRequestException);
      expect(prisma.paidStaffSchedule.create).not.toHaveBeenCalled();
    });

    it('rejects effectiveTo before effectiveFrom', async () => {
      await expect(
        service.addBlock(
          USER_ID,
          blockDto({ effectiveFrom: '2026-06-01', effectiveTo: '2026-01-01' }),
          CREATED_BY,
        ),
      ).rejects.toBeInstanceOf(ApiBadRequestException);
    });

    it('creates a well-formed block', async () => {
      const result = await service.addBlock(USER_ID, blockDto(), CREATED_BY);
      expect(result.userId).toBe(USER_ID);
      expect(prisma.paidStaffSchedule.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: USER_ID, createdById: CREATED_BY }) }),
      );
    });
  });

  describe('removeBlock', () => {
    it('rejects removing a block belonging to a different user', async () => {
      prisma.paidStaffSchedule.findUnique.mockResolvedValue({ id: 'b1', userId: 'someone-else' });
      await expect(service.removeBlock(USER_ID, 'b1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.paidStaffSchedule.delete).not.toHaveBeenCalled();
    });

    it('removes a block belonging to the caller-specified user', async () => {
      prisma.paidStaffSchedule.findUnique.mockResolvedValue({ id: 'b1', userId: USER_ID });
      await service.removeBlock(USER_ID, 'b1');
      expect(prisma.paidStaffSchedule.delete).toHaveBeenCalledWith({ where: { id: 'b1' } });
    });
  });

  describe('setOverride', () => {
    it('rejects a non-day-off override with no hours', async () => {
      await expect(
        service.setOverride(USER_ID, { date: '2026-10-05', isOff: false }, CREATED_BY),
      ).rejects.toBeInstanceOf(ApiBadRequestException);
    });

    it('rejects a non-day-off override that ends before it starts', async () => {
      await expect(
        service.setOverride(
          USER_ID,
          { date: '2026-10-05', isOff: false, startMinute: 20 * 60, endMinute: 10 * 60 },
          CREATED_BY,
        ),
      ).rejects.toBeInstanceOf(ApiBadRequestException);
    });

    it('accepts a day-off override with no hours', async () => {
      const result = await service.setOverride(USER_ID, { date: '2026-10-05', isOff: true }, CREATED_BY);
      expect(result.isOff).toBe(true);
      expect(result.startMinute).toBeNull();
    });

    it('upserts by (userId, date)', async () => {
      await service.setOverride(
        USER_ID,
        { date: '2026-10-05', isOff: false, startMinute: 19 * 60, endMinute: 23 * 60 },
        CREATED_BY,
      );
      expect(prisma.paidStaffScheduleOverride.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId_date: expect.objectContaining({ userId: USER_ID }) } }),
      );
    });
  });

  describe('isOnClock', () => {
    it('resolves against the caller-specific override in preference to the recurring pattern', async () => {
      prisma.paidStaffSchedule.findMany.mockResolvedValue([
        { id: 'b1', userId: USER_ID, dayOfWeek: 1, startMinute: 8 * 60, endMinute: 16 * 60, effectiveFrom: new Date('2026-01-01'), effectiveTo: null },
      ]);
      prisma.paidStaffScheduleOverride.findUnique.mockResolvedValue({
        id: 'o1',
        userId: USER_ID,
        date: new Date('2026-10-05'),
        isOff: true,
        startMinute: null,
        endMinute: null,
        notes: null,
      });
      // 2026-10-05 is a Monday, inside the recurring block — but the day-off override wins.
      const onClock = await service.isOnClock(USER_ID, '2026-10-05', 9 * 60, 12 * 60);
      expect(onClock).toBe(false);
    });

    it('falls back to the recurring pattern when no override exists for the date', async () => {
      prisma.paidStaffSchedule.findMany.mockResolvedValue([
        { id: 'b1', userId: USER_ID, dayOfWeek: 1, startMinute: 8 * 60, endMinute: 16 * 60, effectiveFrom: new Date('2026-01-01'), effectiveTo: null },
      ]);
      const onClock = await service.isOnClock(USER_ID, '2026-10-05', 9 * 60, 12 * 60);
      expect(onClock).toBe(true);
    });
  });
});
