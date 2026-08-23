import { NumberableReport, orderForNumbering } from '@redinfo/shared';

/**
 * `orderForNumbering` is the testable twin of the SQL `ORDER BY` in
 * `event-report-numbering.ts`.
 *
 * The window function itself is exercised against a real Postgres in
 * `event-reports.integration.spec.ts` — what is worth pinning down here is the
 * *rule*: which of two reports comes first, and in particular that the answer is
 * never "it depends", because the same partition must renumber identically on
 * every run.
 */

const report = (
  id: string,
  overrides: Partial<NumberableReport> = {},
): NumberableReport => ({
  id,
  activationAt: null,
  startedAt: '2026-08-22T20:00:00.000Z',
  createdAt: '2026-08-23T09:00:00.000Z',
  ...overrides,
});

const ids = (reports: NumberableReport[]) => reports.map((entry) => entry.id);

describe('orderForNumbering', () => {
  it('orders by activation time, not by when the report was filed', () => {
    const late = report('late-activation', {
      activationAt: '2026-08-22T23:00:00.000Z',
      createdAt: '2026-08-22T23:10:00.000Z',
    });
    const early = report('early-activation', {
      activationAt: '2026-08-22T18:00:00.000Z',
      // Typed up the next morning, long after the other one was filed.
      createdAt: '2026-08-23T09:00:00.000Z',
    });

    expect(ids(orderForNumbering([late, early]))).toEqual([
      'early-activation',
      'late-activation',
    ]);
  });

  it('falls back to the start time for a report that never stamped an activation', () => {
    const stamped = report('stamped', { activationAt: '2026-08-22T21:00:00.000Z' });
    const unstamped = report('unstamped', { startedAt: '2026-08-22T19:00:00.000Z' });

    expect(ids(orderForNumbering([stamped, unstamped]))).toEqual(['unstamped', 'stamped']);
  });

  it('treats an empty activation like an absent one', () => {
    const blank = report('blank', { activationAt: '', startedAt: '2026-08-22T19:00:00.000Z' });
    const stamped = report('stamped', { activationAt: '2026-08-22T21:00:00.000Z' });

    expect(ids(orderForNumbering([blank, stamped]))).toEqual(['blank', 'stamped']);
  });

  it('breaks a tie on activation with creation order', () => {
    const at = '2026-08-22T20:00:00.000Z';
    const second = report('second', { activationAt: at, createdAt: '2026-08-23T10:00:00Z' });
    const first = report('first', { activationAt: at, createdAt: '2026-08-23T09:00:00Z' });

    expect(ids(orderForNumbering([second, first]))).toEqual(['first', 'second']);
  });

  // The point of the id tiebreaker: without it, two reports activated in the
  // same second and created in the same millisecond would have no defined
  // position, and the partition would renumber differently on two runs.
  it('is total — an exact tie still has one answer, and always the same one', () => {
    const same = { activationAt: '2026-08-22T20:00:00.000Z', createdAt: '2026-08-23T09:00:00Z' };
    const b = report('bbb', same);
    const a = report('aaa', same);

    expect(ids(orderForNumbering([b, a]))).toEqual(['aaa', 'bbb']);
    expect(ids(orderForNumbering([a, b]))).toEqual(['aaa', 'bbb']);
  });

  it('does not mutate what it was given', () => {
    const input = [report('b', { activationAt: '2026-08-22T21:00:00Z' }), report('a')];
    const before = ids(input);
    orderForNumbering(input);
    expect(ids(input)).toEqual(before);
  });

  it('numbers a partition gap-free, 1-based, when positions are taken from it', () => {
    const partition = [
      report('c', { activationAt: '2026-08-22T22:00:00Z' }),
      report('a', { activationAt: '2026-08-22T18:00:00Z' }),
      report('b', { activationAt: '2026-08-22T20:00:00Z' }),
    ];
    const numbered = orderForNumbering(partition).map((entry, index) => ({
      id: entry.id,
      number: index + 1,
    }));

    expect(numbered).toEqual([
      { id: 'a', number: 1 },
      { id: 'b', number: 2 },
      { id: 'c', number: 3 },
    ]);
  });

  it('closes the gap when a report is removed from the middle', () => {
    const partition = [
      report('a', { activationAt: '2026-08-22T18:00:00Z' }),
      report('b', { activationAt: '2026-08-22T20:00:00Z' }),
      report('c', { activationAt: '2026-08-22T22:00:00Z' }),
    ];
    const remaining = partition.filter((entry) => entry.id !== 'b');

    expect(
      orderForNumbering(remaining).map((entry, index) => [entry.id, index + 1]),
    ).toEqual([
      ['a', 1],
      ['c', 2],
    ]);
  });
});
