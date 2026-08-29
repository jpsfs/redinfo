import { buildChronology } from './chronology';

const base = { data: '2024-06-10', timezone: 'UTC' } as const;

describe('buildChronology — straight in-order case', () => {
  it('carries every field through with no rollover and no timezone shift', () => {
    const outcome = buildChronology({
      ...base,
      hChamada: '08:00:00',
      hcl: '08:10:00',
      hsl: '08:40:00',
      hch: '08:55:00',
      hd: '09:30:00',
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result).toEqual({
      occurredOn: '2024-06-10',
      activationAt: '2024-06-10T08:00:00.000Z',
      sceneArrivalAt: '2024-06-10T08:10:00.000Z',
      sceneDepartureAt: '2024-06-10T08:40:00.000Z',
      hospitalArrivalAt: '2024-06-10T08:55:00.000Z',
      availableAt: '2024-06-10T09:30:00.000Z',
      startedAt: '2024-06-10T08:00:00.000Z',
      endedAt: '2024-06-10T09:30:00.000Z',
    });
  });
});

describe('buildChronology — midnight rollover', () => {
  it('rolls a single field (the last) onto the next day', () => {
    const outcome = buildChronology({
      ...base,
      hChamada: '23:40:00',
      hcl: '23:45:00',
      hsl: '23:50:00',
      hch: '23:55:00',
      hd: '00:15:00',
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.availableAt).toBe('2024-06-11T00:15:00.000Z');
    expect(outcome.result.endedAt).toBe('2024-06-11T00:15:00.000Z');
  });

  it('rolls twice — a shift that runs past midnight, and past it again', () => {
    const outcome = buildChronology({
      ...base,
      hChamada: '23:00:00',
      hcl: '23:30:00',
      hsl: '00:10:00', // day+1
      hch: '23:50:00', // still day+1 — 23:50 > 00:10, no new rollover
      hd: '00:05:00', // day+2 — 00:05 < 23:50
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.activationAt).toBe('2024-06-10T23:00:00.000Z');
    expect(outcome.result.sceneArrivalAt).toBe('2024-06-10T23:30:00.000Z');
    expect(outcome.result.sceneDepartureAt).toBe('2024-06-11T00:10:00.000Z');
    expect(outcome.result.hospitalArrivalAt).toBe('2024-06-11T23:50:00.000Z');
    expect(outcome.result.availableAt).toBe('2024-06-12T00:05:00.000Z');
  });

  it('rolls on every one of the five fields when each is earlier than the last', () => {
    const outcome = buildChronology({
      ...base,
      hChamada: '23:00:00',
      hcl: '22:00:00', // day+1
      hsl: '21:00:00', // day+2
      hch: '20:00:00', // day+3
      hd: '19:00:00', // day+4
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.activationAt).toBe('2024-06-10T23:00:00.000Z');
    expect(outcome.result.sceneArrivalAt).toBe('2024-06-11T22:00:00.000Z');
    expect(outcome.result.sceneDepartureAt).toBe('2024-06-12T21:00:00.000Z');
    expect(outcome.result.hospitalArrivalAt).toBe('2024-06-13T20:00:00.000Z');
    expect(outcome.result.availableAt).toBe('2024-06-14T19:00:00.000Z');
  });

  it('hd earlier than h_chamada, with nothing in between, still rolls to the next day', () => {
    const outcome = buildChronology({
      ...base,
      hChamada: '22:00:00',
      hcl: null,
      hsl: null,
      hch: null,
      hd: '05:00:00',
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.availableAt).toBe('2024-06-11T05:00:00.000Z');
  });
});

describe('buildChronology — nulls', () => {
  it('leaves an absent field null and compares only against the last present one', () => {
    const outcome = buildChronology({
      ...base,
      hChamada: '08:00:00',
      hcl: null,
      hsl: '09:00:00',
      hch: null,
      hd: '10:00:00',
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.sceneArrivalAt).toBeNull();
    expect(outcome.result.hospitalArrivalAt).toBeNull();
    expect(outcome.result.sceneDepartureAt).toBe('2024-06-10T09:00:00.000Z');
    expect(outcome.result.availableAt).toBe('2024-06-10T10:00:00.000Z');
  });
});

describe('buildChronology — MySQL TIME beyond 24 hours', () => {
  it('reads the hour modulo 24 rather than rejecting an out-of-range value', () => {
    const outcome = buildChronology({
      ...base,
      hChamada: '00:30:00',
      hcl: '25:10:00', // hour 25 mod 24 = 1 → 01:10, still later than 00:30 same day
      hsl: null,
      hch: null,
      hd: null,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.sceneArrivalAt).toBe('2024-06-10T01:10:00.000Z');
  });

  it('an extended value that folds earlier than the previous field still rolls over', () => {
    const outcome = buildChronology({
      ...base,
      hChamada: '23:50:00',
      hcl: '24:10:00', // hour 24 mod 24 = 0 → 00:10, earlier than 23:50 → rolls
      hsl: null,
      hch: null,
      hd: null,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.sceneArrivalAt).toBe('2024-06-11T00:10:00.000Z');
  });
});

describe('buildChronology — Europe/Lisbon DST boundaries', () => {
  const lisbon = { timezone: 'Europe/Lisbon' } as const;

  it('the day before the spring-forward transition has no offset (WET, UTC+0)', () => {
    const outcome = buildChronology({
      ...lisbon,
      data: '2024-03-30',
      hChamada: '10:00:00',
      hcl: null,
      hsl: null,
      hch: null,
      hd: null,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.activationAt).toBe('2024-03-30T10:00:00.000Z');
  });

  it('the day after the spring-forward transition is an hour ahead (WEST, UTC+1)', () => {
    const outcome = buildChronology({
      ...lisbon,
      data: '2024-04-01',
      hChamada: '10:00:00',
      hcl: null,
      hsl: null,
      hch: null,
      hd: null,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.activationAt).toBe('2024-04-01T09:00:00.000Z');
  });

  it('the day before the autumn fall-back transition is still an hour ahead', () => {
    const outcome = buildChronology({
      ...lisbon,
      data: '2024-10-26',
      hChamada: '10:00:00',
      hcl: null,
      hsl: null,
      hch: null,
      hd: null,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.activationAt).toBe('2024-10-26T09:00:00.000Z');
  });

  it('the day after the autumn fall-back transition has no offset again', () => {
    const outcome = buildChronology({
      ...lisbon,
      data: '2024-10-28',
      hChamada: '10:00:00',
      hcl: null,
      hsl: null,
      hch: null,
      hd: null,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.activationAt).toBe('2024-10-28T10:00:00.000Z');
  });

  /**
   * The one input `buildChronology`'s rollover logic cannot fix: on the
   * spring-forward day itself, 01:00–01:59 WET is immediately followed by
   * 02:00 WEST — wall-clock 02:00 is *earlier*, in real elapsed time, than
   * wall-clock 01:59 was a moment before. Legacy has no way to record that a
   * crew was dispatched inside the skipped hour, so a `saidas` row that
   * straddles it is genuinely unrepresentable — this is what
   * `validateOccurrenceTimes` is there to catch rather than silently import.
   */
  it('a pair of times straddling the skipped hour rejects as out of order', () => {
    const outcome = buildChronology({
      ...lisbon,
      data: '2024-03-31',
      hChamada: '01:59:00',
      hcl: '02:00:00',
      hsl: null,
      hch: null,
      hd: null,
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.problem.code).toBe('TIMES_OUT_OF_ORDER');
  });
});
