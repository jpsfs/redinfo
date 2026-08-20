import { BadRequestException } from '@nestjs/common';
import { ShiftScheduleService } from './shift-schedule.service';
import { HolidaysService } from './holidays.service';
import { ShiftCode } from '@redinfo/shared';

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

const HOLIDAYS = {
  // Monday — a workday that the holiday table turns into a two-shift day.
  '2026-10-05': 'Implantação da República',
  // Saturday — already a two-shift day; the holiday must not double it.
  '2026-12-26': 'Boxing Day (test)',
};

describe('ShiftScheduleService', () => {
  let service: ShiftScheduleService;
  let holidays: ReturnType<typeof buildHolidaysStub>;

  beforeEach(() => {
    holidays = buildHolidaysStub(HOLIDAYS);
    service = new ShiftScheduleService(holidays as unknown as HolidaysService);
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

  // ── the fixed shift grid (AC: submit per day and shift) ─────────────────────

  describe('getShiftsForDate', () => {
    it('gives a workday exactly one shift, 20:00–24:00', async () => {
      await expect(service.getShiftsForDate('2026-09-30')).resolves.toEqual([
        ShiftCode.EVENING,
      ]);
    });

    it('gives a weekend day two shifts, 08:00–16:00 and 16:00–24:00', async () => {
      await expect(service.getShiftsForDate('2026-10-03')).resolves.toEqual([
        ShiftCode.MORNING,
        ShiftCode.AFTERNOON,
      ]);
    });

    it('gives a holiday the weekend pattern', async () => {
      await expect(service.getShiftsForDate('2026-10-05')).resolves.toEqual([
        ShiftCode.MORNING,
        ShiftCode.AFTERNOON,
      ]);
    });
  });

  describe('getPatternForDate', () => {
    it('labels the workday shift with its hours', async () => {
      const pattern = await service.getPatternForDate('2026-09-29');
      expect(pattern).toMatchObject({
        date: '2026-09-29',
        isWeekend: false,
        isHoliday: false,
        holidayName: null,
      });
      expect(pattern.shifts).toEqual([
        { code: ShiftCode.EVENING, label: '20:00–24:00', startHour: 20, endHour: 24 },
      ]);
    });

    it('carries the holiday name through for display', async () => {
      const pattern = await service.getPatternForDate('2026-10-05');
      expect(pattern.isHoliday).toBe(true);
      expect(pattern.holidayName).toBe('Implantação da República');
      expect(pattern.shifts.map((s) => s.label)).toEqual(['08:00–16:00', '16:00–24:00']);
    });
  });

  // ── ranges ──────────────────────────────────────────────────────────────────

  describe('getPatternForRange', () => {
    it('covers a window spanning weekdays, a weekend and a holiday', async () => {
      const patterns = await service.getPatternForRange('2026-09-28', '2026-10-05');

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
    });

    it('queries holidays once for the whole range, not per day', async () => {
      await service.getPatternForRange('2026-09-28', '2026-10-05');
      expect(holidays.findBetween).toHaveBeenCalledTimes(1);
      expect(holidays.isHoliday).not.toHaveBeenCalled();
    });

    it('rejects an end date before the start date', async () => {
      await expect(service.getPatternForRange('2026-10-05', '2026-10-01')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects an absurdly long range', async () => {
      await expect(service.getPatternForRange('2026-01-01', '2028-01-01')).rejects.toThrow(
        BadRequestException,
      );
    });

    it.each(['2026-13-01', '05-10-2026', 'tomorrow'])(
      'rejects malformed date %s',
      async (value) => {
        await expect(service.getPatternForRange(value, '2026-10-05')).rejects.toThrow(
          BadRequestException,
        );
      },
    );
  });

  // ── validation used by submission ───────────────────────────────────────────

  describe('assertShiftValidForPattern', () => {
    it('accepts EVENING on a workday', async () => {
      const pattern = await service.getPatternForDate('2026-09-30');
      expect(() => service.assertShiftValidForPattern(pattern, ShiftCode.EVENING)).not.toThrow();
    });

    it('rejects MORNING on a workday', async () => {
      const pattern = await service.getPatternForDate('2026-09-30');
      expect(() => service.assertShiftValidForPattern(pattern, ShiftCode.MORNING)).toThrow(
        BadRequestException,
      );
    });

    it('rejects EVENING on a weekend day', async () => {
      const pattern = await service.getPatternForDate('2026-10-03');
      expect(() => service.assertShiftValidForPattern(pattern, ShiftCode.EVENING)).toThrow(
        BadRequestException,
      );
    });

    it('accepts both weekend shifts on a holiday', async () => {
      const pattern = await service.getPatternForDate('2026-10-05');
      expect(() => service.assertShiftValidForPattern(pattern, ShiftCode.MORNING)).not.toThrow();
      expect(() => service.assertShiftValidForPattern(pattern, ShiftCode.AFTERNOON)).not.toThrow();
    });
  });

  describe('isWeekend', () => {
    it('ignores the holiday table (calendar weekend only)', () => {
      expect(service.isWeekend('2026-10-05')).toBe(false);
      expect(service.isWeekend('2026-10-04')).toBe(true);
    });
  });
});
