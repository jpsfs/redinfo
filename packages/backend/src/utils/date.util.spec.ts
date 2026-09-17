import {
  addIsoDays,
  isIsoDate,
  isoDateRange,
  isoDayOfWeek,
  isWeekendDate,
  parseIsoDate,
  toIsoDate,
} from './date.util';

describe('date.util', () => {
  describe('isIsoDate', () => {
    it.each(['2026-01-01', '2026-10-05', '2028-02-29'])('accepts %s', (value) => {
      expect(isIsoDate(value)).toBe(true);
    });

    it.each([
      '2026-2-3',
      '2026-02-30',
      '2026-13-01',
      '05/10/2026',
      '2026-10-05T12:00:00Z',
      '',
      'not-a-date',
    ])('rejects %s', (value) => {
      expect(isIsoDate(value)).toBe(false);
    });

    it('rejects non-strings', () => {
      expect(isIsoDate(undefined)).toBe(false);
      expect(isIsoDate(20261005)).toBe(false);
      expect(isIsoDate(new Date())).toBe(false);
    });
  });

  describe('parseIsoDate / toIsoDate', () => {
    it('parses to UTC midnight so no timezone can shift the day', () => {
      const parsed = parseIsoDate('2026-10-05');
      expect(parsed.toISOString()).toBe('2026-10-05T00:00:00.000Z');
    });

    it('round-trips through toIsoDate', () => {
      expect(toIsoDate(parseIsoDate('2026-03-29'))).toBe('2026-03-29');
    });

    it('reads a full timestamp back as its UTC calendar day', () => {
      expect(toIsoDate('2026-10-05T23:30:00.000Z')).toBe('2026-10-05');
    });
  });

  describe('isoDayOfWeek / isWeekendDate', () => {
    it('maps Mon–Sun of a known week', () => {
      // 2026-09-28 is a Monday.
      expect(isoDayOfWeek('2026-09-28')).toBe(1);
      expect(isoDayOfWeek('2026-10-03')).toBe(6);
      expect(isoDayOfWeek('2026-10-04')).toBe(0);
    });

    it('treats only Saturday and Sunday as weekend', () => {
      expect(isWeekendDate('2026-10-02')).toBe(false); // Friday
      expect(isWeekendDate('2026-10-03')).toBe(true); // Saturday
      expect(isWeekendDate('2026-10-04')).toBe(true); // Sunday
      expect(isWeekendDate('2026-10-05')).toBe(false); // Monday
    });
  });

  describe('addIsoDays', () => {
    it('crosses month and year boundaries', () => {
      expect(addIsoDays('2026-09-30', 1)).toBe('2026-10-01');
      expect(addIsoDays('2026-12-31', 1)).toBe('2027-01-01');
      expect(addIsoDays('2026-01-01', -1)).toBe('2025-12-31');
    });

    it('crosses a DST boundary without drifting', () => {
      // Europe/Lisbon leaves DST on 2026-10-25.
      expect(addIsoDays('2026-10-24', 1)).toBe('2026-10-25');
      expect(addIsoDays('2026-10-25', 1)).toBe('2026-10-26');
    });
  });

  describe('isoDateRange', () => {
    it('is inclusive of both ends', () => {
      expect(isoDateRange('2026-10-03', '2026-10-05')).toEqual([
        '2026-10-03',
        '2026-10-04',
        '2026-10-05',
      ]);
    });

    it('returns a single day when from equals to', () => {
      expect(isoDateRange('2026-10-05', '2026-10-05')).toEqual(['2026-10-05']);
    });

    it('returns empty when the end precedes the start', () => {
      expect(isoDateRange('2026-10-05', '2026-10-01')).toEqual([]);
    });
  });
});
