import { BadRequestException } from '@nestjs/common';
import { ShiftScheduleService } from './shift-schedule.service';
import { HolidaysService } from './holidays.service';
import { PrismaService } from '../prisma/prisma.service';
import { DayShiftPattern } from '@redinfo/shared';

// ── helpers ────────────────────────────────────────────────────────────────────

/** A HolidaysService stub backed by a plain `date → name` map. */
function buildHolidaysStub(holidays: Record<string, string> = {}) {
  return {
    findBetween: jest.fn(async (from: string, to: string) => {
      const entries = Object.entries(holidays).filter(
        ([date]) => date >= from && date <= to,
      );
      return new Map(entries);
    }),
    isHoliday: jest.fn(async (date: string) => date in holidays),
  };
}

type ShiftRow = { date: Date; slot: number; startHour: number; endHour: number };

/** Prisma stub serving one window's stored shift rows. */
function buildPrismaStub(rows: ShiftRow[] = []) {
  return {
    availabilityWindowShift: {
      findMany: jest.fn().mockResolvedValue(rows),
    },
  };
}

const HOLIDAYS = {
  // Monday — a workday that the holiday table turns into a two-shift day.
  '2026-10-05': 'Implantação da República',
  // Saturday — already a two-shift day; the holiday must not double it.
  '2026-12-26': 'Boxing Day (test)',
};

const WINDOW = { id: 'win-1', startDate: '2026-09-28', endDate: '2026-09-30' };

function shiftRow(date: string, slot: number, startHour: number, endHour: number): ShiftRow {
  return { date: new Date(`${date}T00:00:00.000Z`), slot, startHour, endHour };
}

function build(rows: ShiftRow[] = []) {
  const holidays = buildHolidaysStub(HOLIDAYS);
  const prisma = buildPrismaStub(rows);
  const service = new ShiftScheduleService(
    holidays as unknown as HolidaysService,
    prisma as unknown as PrismaService,
  );
  return { service, holidays, prisma };
}

describe('ShiftScheduleService', () => {
  let service: ShiftScheduleService;
  let holidays: ReturnType<typeof buildHolidaysStub>;

  beforeEach(() => {
    ({ service, holidays } = build());
  });

  // ── day types ───────────────────────────────────────────────────────────────

  describe('getDayType', () => {
    it('classifies Mon–Fri as workday', async () => {
      await expect(service.getDayType('2026-09-28')).resolves.toBe('workday');
      await expect(service.getDayType('2026-10-02')).resolves.toBe('workday');
    });

    it('classifies Saturday and Sunday as weekend', async () => {
      await expect(service.getDayType('2026-10-03')).resolves.toBe('weekend');
      await expect(service.getDayType('2026-10-04')).resolves.toBe('weekend');
    });

    it('classifies a listed holiday as holiday, even on a weekday', async () => {
      await expect(service.getDayType('2026-10-05')).resolves.toBe('holiday');
    });

    it('prefers holiday over weekend when a holiday falls on a Saturday', async () => {
      await expect(service.getDayType('2026-12-26')).resolves.toBe('holiday');
    });
  });

  describe('isWeekend', () => {
    it('ignores the holiday table (calendar weekend only)', () => {
      expect(service.isWeekend('2026-10-05')).toBe(false);
      expect(service.isWeekend('2026-10-04')).toBe(true);
    });
  });

  // ── the default grid, which seeds a new window ───────────────────────────────

  describe('getDefaultShiftsForDate', () => {
    it('gives a workday exactly one shift, 20:00–24:00', async () => {
      await expect(service.getDefaultShiftsForDate('2026-09-30')).resolves.toEqual([
        { startHour: 20, endHour: 24 },
      ]);
    });

    it('gives a weekend day two shifts, 08:00–16:00 and 16:00–24:00', async () => {
      await expect(service.getDefaultShiftsForDate('2026-10-03')).resolves.toEqual([
        { startHour: 8, endHour: 16 },
        { startHour: 16, endHour: 24 },
      ]);
    });

    it('gives a holiday the weekend pattern', async () => {
      await expect(service.getDefaultShiftsForDate('2026-10-05')).resolves.toEqual([
        { startHour: 8, endHour: 16 },
        { startHour: 16, endHour: 24 },
      ]);
    });

    it('hands out copies, so an editor cannot mutate the defaults', async () => {
      const first = await service.getDefaultShiftsForDate('2026-09-30');
      first[0].startHour = 6;
      await expect(service.getDefaultShiftsForDate('2026-09-30')).resolves.toEqual([
        { startHour: 20, endHour: 24 },
      ]);
    });
  });

  describe('getDefaultPatternForRange', () => {
    it('covers a range spanning weekdays, a weekend and a holiday', async () => {
      const patterns = await service.getDefaultPatternForRange('2026-09-28', '2026-10-05');

      expect(patterns).toHaveLength(8);
      expect(patterns.map((p) => p.shifts.length)).toEqual([1, 1, 1, 1, 1, 2, 2, 2]);
      expect(patterns.map((p) => p.date)).toEqual([
        '2026-09-28',
        '2026-09-29',
        '2026-09-30',
        '2026-10-01',
        '2026-10-02',
        '2026-10-03',
        '2026-10-04',
        '2026-10-05',
      ]);
      expect(patterns[7].isHoliday).toBe(true);
      expect(patterns[7].holidayName).toBe('Implantação da República');
    });

    it('numbers slots from 1 in start-time order and labels them', async () => {
      const [pattern] = await service.getDefaultPatternForRange('2026-10-03', '2026-10-03');
      expect(pattern.shifts).toEqual([
        { slot: 1, startHour: 8, endHour: 16, label: '08:00–16:00' },
        { slot: 2, startHour: 16, endHour: 24, label: '16:00–24:00' },
      ]);
    });

    it('queries holidays once for the whole range, not per day', async () => {
      await service.getDefaultPatternForRange('2026-09-28', '2026-10-05');
      expect(holidays.findBetween).toHaveBeenCalledTimes(1);
      expect(holidays.isHoliday).not.toHaveBeenCalled();
    });

    it('rejects an end date before the start date', async () => {
      await expect(
        service.getDefaultPatternForRange('2026-10-05', '2026-10-01'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an absurdly long range', async () => {
      await expect(
        service.getDefaultPatternForRange('2026-01-01', '2028-01-01'),
      ).rejects.toThrow(BadRequestException);
    });

    it.each(['2026-13-01', '05-10-2026', 'tomorrow'])(
      'rejects malformed date %s',
      async (value) => {
        await expect(
          service.getDefaultPatternForRange(value, '2026-10-05'),
        ).rejects.toThrow(BadRequestException);
      },
    );
  });

  // ── a window's own grid ─────────────────────────────────────────────────────

  describe('getPatternForWindow', () => {
    it("reads the window's stored shifts, whatever the day type", async () => {
      // A Monday given the two-shift treatment, and a Wednesday left custom.
      const built = build([
        shiftRow('2026-09-28', 1, 8, 16),
        shiftRow('2026-09-28', 2, 16, 24),
        shiftRow('2026-09-30', 1, 10, 14),
      ]);

      const patterns = await built.service.getPatternForWindow(WINDOW);

      expect(patterns.map((p) => p.shifts.map((s) => s.label))).toEqual([
        ['08:00–16:00', '16:00–24:00'],
        [],
        ['10:00–14:00'],
      ]);
    });

    it('leaves a day with no stored shifts empty rather than filling it in', async () => {
      const built = build([shiftRow('2026-09-28', 1, 20, 24)]);
      const patterns = await built.service.getPatternForWindow(WINDOW);
      expect(patterns[1].shifts).toEqual([]);
      expect(patterns[2].shifts).toEqual([]);
    });

    it('keeps day-type and holiday flags, which drive the calendar styling', async () => {
      const built = build([shiftRow('2026-10-05', 1, 9, 12)]);
      const [pattern] = await built.service.getPatternForWindow({
        id: 'win-2',
        startDate: '2026-10-05',
        endDate: '2026-10-05',
      });

      expect(pattern.isHoliday).toBe(true);
      expect(pattern.holidayName).toBe('Implantação da República');
      expect(pattern.shifts).toEqual([
        { slot: 1, startHour: 9, endHour: 12, label: '09:00–12:00' },
      ]);
    });

    it('preserves stored slot numbers instead of renumbering them', async () => {
      // Submissions point at slots, so a gap left by an edit must not shift.
      const built = build([shiftRow('2026-09-28', 2, 16, 24)]);
      const [pattern] = await built.service.getPatternForWindow(WINDOW);
      expect(pattern.shifts).toEqual([
        { slot: 2, startHour: 16, endHour: 24, label: '16:00–24:00' },
      ]);
    });

    it('falls back to the default grid for a window with no stored shifts at all', async () => {
      // Windows opened before per-day shifts existed; a blank calendar would
      // read as "nobody is needed" rather than "this data is missing".
      const patterns = await service.getPatternForWindow(WINDOW);
      expect(patterns.map((p) => p.shifts.map((s) => s.label))).toEqual([
        ['20:00–24:00'],
        ['20:00–24:00'],
        ['20:00–24:00'],
      ]);
    });

    it('only loads the shifts of the window asked for', async () => {
      const built = build([shiftRow('2026-09-28', 1, 20, 24)]);
      await built.service.getPatternForWindow(WINDOW);
      expect(built.prisma.availabilityWindowShift.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { windowId: 'win-1' } }),
      );
    });
  });

  // ── validation of an edited day ─────────────────────────────────────────────

  describe('normaliseDayShifts', () => {
    it('sorts by start time and strips anything but the times', () => {
      expect(
        service.normaliseDayShifts('2026-10-03', [
          { startHour: 16, endHour: 24 },
          { startHour: 8, endHour: 16 },
        ]),
      ).toEqual([
        { startHour: 8, endHour: 16 },
        { startHour: 16, endHour: 24 },
      ]);
    });

    it('accepts a day with no shifts at all', () => {
      expect(service.normaliseDayShifts('2026-10-03', [])).toEqual([]);
    });

    it('rejects overlapping shifts, naming the date', () => {
      expect(() =>
        service.normaliseDayShifts('2026-10-03', [
          { startHour: 8, endHour: 16 },
          { startHour: 12, endHour: 20 },
        ]),
      ).toThrow(/2026-10-03.*overlap/);
    });

    it('rejects a shift that ends before it starts', () => {
      expect(() =>
        service.normaliseDayShifts('2026-10-03', [{ startHour: 20, endHour: 8 }]),
      ).toThrow(BadRequestException);
    });

    it('accepts back-to-back shifts, which do not overlap', () => {
      expect(
        service.normaliseDayShifts('2026-10-03', [
          { startHour: 8, endHour: 16 },
          { startHour: 16, endHour: 24 },
        ]),
      ).toHaveLength(2);
    });
  });

  // ── validation used by submission ───────────────────────────────────────────

  describe('assertSlotValidForPattern', () => {
    const pattern: DayShiftPattern = {
      date: '2026-10-03',
      isWeekend: true,
      isHoliday: false,
      holidayName: null,
      shifts: [
        { slot: 1, startHour: 8, endHour: 16, label: '08:00–16:00' },
        { slot: 2, startHour: 16, endHour: 24, label: '16:00–24:00' },
      ],
    };

    it('accepts a slot the day has', () => {
      expect(() => service.assertSlotValidForPattern(pattern, 1)).not.toThrow();
      expect(() => service.assertSlotValidForPattern(pattern, 2)).not.toThrow();
    });

    it('rejects a slot beyond the shifts of that day, listing what exists', () => {
      expect(() => service.assertSlotValidForPattern(pattern, 3)).toThrow(
        /does not exist on 2026-10-03.*08:00–16:00/,
      );
    });

    it('says so plainly when the day has no shifts at all', () => {
      expect(() =>
        service.assertSlotValidForPattern({ ...pattern, shifts: [] }, 1),
      ).toThrow(/no shifts in this window/);
    });
  });
});
