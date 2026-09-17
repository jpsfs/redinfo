import { loaderIsSelected, parseCliArgs } from './cli';

describe('parseCliArgs', () => {
  it('defaults to a dry run with no flags', () => {
    const options = parseCliArgs([], { now: () => new Date('2026-01-01T00:00:00Z'), gitShortSha: 'abc1234' });
    expect(options.apply).toBe(false);
    expect(options.batchSize).toBe(500);
    expect(options.only).toBeNull();
    expect(options.runId).toBe('2026-01-01T00:00:00.000Z-abc1234');
  });

  it('--apply commits', () => {
    expect(parseCliArgs(['--apply']).apply).toBe(true);
  });

  it('--dry-run and --apply together is an error', () => {
    expect(() => parseCliArgs(['--dry-run', '--apply'])).toThrow(/mutually exclusive/);
  });

  it('parses --only as a comma-separated list', () => {
    expect(parseCliArgs(['--only', '01-users,03-vehicles']).only).toEqual(['01-users', '03-vehicles']);
  });

  it('validates --since as YYYY-MM-DD', () => {
    expect(parseCliArgs(['--since', '2024-01-01']).since).toBe('2024-01-01');
    expect(() => parseCliArgs(['--since', 'not-a-date'])).toThrow(/YYYY-MM-DD/);
  });

  it('validates --batch-size as a positive integer', () => {
    expect(parseCliArgs(['--batch-size', '100']).batchSize).toBe(100);
    expect(() => parseCliArgs(['--batch-size', '0'])).toThrow();
    expect(() => parseCliArgs(['--batch-size', 'abc'])).toThrow();
  });

  it('accepts an explicit --run-id, overriding the computed default', () => {
    expect(parseCliArgs(['--run-id', 'my-run']).runId).toBe('my-run');
  });

  it('rejects an unknown flag', () => {
    expect(() => parseCliArgs(['--nope'])).toThrow(/Unknown flag/);
  });

  it('sets createHospitals, failOnReject and verbose from their bare flags', () => {
    const options = parseCliArgs(['--create-hospitals', '--fail-on-reject', '--verbose']);
    expect(options.createHospitals).toBe(true);
    expect(options.failOnReject).toBe(true);
    expect(options.verbose).toBe(true);
  });

  it('prunes by default, and --no-prune turns it off', () => {
    expect(parseCliArgs([]).prune).toBe(true);
    expect(parseCliArgs(['--no-prune']).prune).toBe(false);
  });
});

describe('loaderIsSelected', () => {
  it('selects everything when --only was not given', () => {
    expect(loaderIsSelected('01-users', null)).toBe(true);
  });

  it('selects only the named loaders otherwise', () => {
    expect(loaderIsSelected('01-users', ['01-users'])).toBe(true);
    expect(loaderIsSelected('03-vehicles', ['01-users'])).toBe(false);
  });
});
