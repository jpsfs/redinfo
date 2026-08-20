import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { HolidaysService } from './holidays.service';

// ── helpers ────────────────────────────────────────────────────────────────────

function holidayRow(date: string, name: string, id = `hol-${date}`) {
  return {
    id,
    date: new Date(`${date}T00:00:00.000Z`),
    name,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

function buildPrismaStub(overrides: Record<string, unknown> = {}) {
  return {
    holiday: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockImplementation((args) =>
        Promise.resolve(holidayRow('2026-10-05', args.data.name, 'hol-new')),
      ),
      update: jest.fn().mockImplementation((args) =>
        Promise.resolve(holidayRow('2026-10-05', args.data.name ?? 'x', args.where.id)),
      ),
      delete: jest.fn().mockResolvedValue(holidayRow('2026-10-05', 'Implantação da República')),
    },
    $transaction: jest.fn().mockImplementation((ops: unknown[]) => Promise.all(ops)),
    ...overrides,
  };
}

describe('HolidaysService', () => {
  let service: HolidaysService;
  let prisma: ReturnType<typeof buildPrismaStub>;

  beforeEach(() => {
    prisma = buildPrismaStub();
    service = new HolidaysService(prisma as never);
  });

  describe('create', () => {
    it('stores the date at UTC midnight so no timezone shifts the day', async () => {
      await service.create({ date: '2026-10-05', name: 'Implantação da República' });

      const { data } = prisma.holiday.create.mock.calls[0][0];
      expect(data.date.toISOString()).toBe('2026-10-05T00:00:00.000Z');
    });

    it('throws ConflictException when the date is already a holiday', async () => {
      prisma.holiday.findUnique.mockResolvedValue(
        holidayRow('2026-10-05', 'Implantação da República'),
      );

      await expect(
        service.create({ date: '2026-10-05', name: 'Duplicate' }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.holiday.create).not.toHaveBeenCalled();
    });

    it.each(['2026-02-30', '05/10/2026', 'natal'])(
      'rejects malformed date %s',
      async (date) => {
        await expect(service.create({ date, name: 'Bad' })).rejects.toThrow(
          BadRequestException,
        );
      },
    );

    it('normalises a full timestamp down to its calendar day', async () => {
      await service.create({ date: '2026-10-05T18:00:00.000Z', name: 'Late' });

      const { data } = prisma.holiday.create.mock.calls[0][0];
      expect(data.date.toISOString()).toBe('2026-10-05T00:00:00.000Z');
    });
  });

  describe('update', () => {
    it('throws NotFoundException for an unknown id', async () => {
      prisma.holiday.findUnique.mockResolvedValue(null);
      await expect(service.update('nope', { name: 'x' })).rejects.toThrow(NotFoundException);
    });

    it('allows renaming without touching the date', async () => {
      prisma.holiday.findUnique.mockResolvedValue(holidayRow('2026-10-05', 'Old name'));

      await service.update('hol-1', { name: 'New name' });

      const { data } = prisma.holiday.update.mock.calls[0][0];
      expect(data).toEqual({ name: 'New name' });
    });

    it('throws ConflictException when moving onto another holiday’s date', async () => {
      prisma.holiday.findUnique
        .mockResolvedValueOnce(holidayRow('2026-10-05', 'Mine', 'hol-1'))
        .mockResolvedValueOnce(holidayRow('2026-11-01', 'Someone else', 'hol-2'));

      await expect(service.update('hol-1', { date: '2026-11-01' })).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.holiday.update).not.toHaveBeenCalled();
    });

    it('allows re-saving a holiday on its own date', async () => {
      prisma.holiday.findUnique.mockResolvedValue(holidayRow('2026-10-05', 'Mine', 'hol-1'));

      await expect(
        service.update('hol-1', { date: '2026-10-05', name: 'Mine' }),
      ).resolves.toBeDefined();
    });
  });

  describe('findAll', () => {
    it('serialises dates as ISO calendar days, ascending', async () => {
      prisma.holiday.findMany.mockResolvedValue([
        holidayRow('2026-10-05', 'Implantação da República'),
        holidayRow('2026-11-01', 'Todos os Santos'),
      ]);
      prisma.holiday.count.mockResolvedValue(2);

      const result = await service.findAll();

      expect(prisma.holiday.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { date: 'asc' } }),
      );
      expect(result.data.map((holiday) => holiday.date)).toEqual(['2026-10-05', '2026-11-01']);
      expect(result.total).toBe(2);
    });

    it('filters by an inclusive date range when asked', async () => {
      await service.findAll(1, 100, '2026-10-01', '2026-10-31');

      const { where } = prisma.holiday.findMany.mock.calls[0][0];
      expect(where.date.gte.toISOString()).toBe('2026-10-01T00:00:00.000Z');
      expect(where.date.lte.toISOString()).toBe('2026-10-31T00:00:00.000Z');
    });
  });

  describe('findBetween', () => {
    it('returns a date → name map for the shift-schedule lookup', async () => {
      prisma.holiday.findMany.mockResolvedValue([
        holidayRow('2026-10-05', 'Implantação da República'),
      ]);

      const map = await service.findBetween('2026-09-28', '2026-10-05');

      expect(map.get('2026-10-05')).toBe('Implantação da República');
      expect(map.has('2026-09-28')).toBe(false);
    });
  });

  describe('isHoliday', () => {
    it('is true only when a row exists for that exact day', async () => {
      prisma.holiday.findUnique.mockResolvedValueOnce(holidayRow('2026-10-05', 'Holiday'));
      await expect(service.isHoliday('2026-10-05')).resolves.toBe(true);

      prisma.holiday.findUnique.mockResolvedValueOnce(null);
      await expect(service.isHoliday('2026-10-06')).resolves.toBe(false);
    });
  });

  describe('remove', () => {
    it('throws NotFoundException for an unknown id', async () => {
      prisma.holiday.findUnique.mockResolvedValue(null);
      await expect(service.remove('nope')).rejects.toThrow(NotFoundException);
    });
  });
});
