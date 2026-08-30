import { AuditSnapshot, diffAuditSnapshots } from './audit-diff';

const SENSITIVE = new Set(['bloodType', 'nif']);

describe('diffAuditSnapshots', () => {
  it('emits nothing between two identical snapshots', () => {
    const snapshots = [
      { changedAt: '2020-01-01', updatedBy: 'admin', fields: { name: 'Ana' } },
      { changedAt: '2020-02-01', updatedBy: 'admin', fields: { name: 'Ana' } },
    ];
    expect(diffAuditSnapshots(snapshots, SENSITIVE)).toEqual([]);
  });

  it('emits one entry per changed field, attributed to the later snapshot', () => {
    const snapshots = [
      { changedAt: '2020-01-01', updatedBy: 'admin', fields: { name: 'Ana', phone: '911111111' } },
      { changedAt: '2020-02-01', updatedBy: 'coord', fields: { name: 'Ana Maria', phone: '911111111' } },
    ];
    const result = diffAuditSnapshots(snapshots, SENSITIVE);
    expect(result).toEqual([
      { field: 'name', oldValue: 'Ana', newValue: 'Ana Maria', changedAt: '2020-02-01', updatedBy: 'coord' },
    ]);
  });

  it('nulls out both old and new value for a sensitive field, but still records that it changed', () => {
    const snapshots = [
      { changedAt: '2020-01-01', updatedBy: 'admin', fields: { bloodType: 'A_POS' } },
      { changedAt: '2020-02-01', updatedBy: 'admin', fields: { bloodType: 'O_NEG' } },
    ];
    expect(diffAuditSnapshots(snapshots, SENSITIVE)).toEqual([
      { field: 'bloodType', oldValue: null, newValue: null, changedAt: '2020-02-01', updatedBy: 'admin' },
    ]);
  });

  it('treats a field missing from one snapshot as null, not as "skip"', () => {
    const snapshots: AuditSnapshot[] = [
      { changedAt: '2020-01-01', updatedBy: 'admin', fields: {} },
      { changedAt: '2020-02-01', updatedBy: 'admin', fields: { nif: '123456789' } },
    ];
    expect(diffAuditSnapshots(snapshots, new Set())).toEqual([
      { field: 'nif', oldValue: null, newValue: '123456789', changedAt: '2020-02-01', updatedBy: 'admin' },
    ]);
  });

  it('walks every consecutive pair across more than two snapshots', () => {
    const snapshots = [
      { changedAt: '2020-01-01', updatedBy: 'a', fields: { name: 'Ana' } },
      { changedAt: '2020-02-01', updatedBy: 'b', fields: { name: 'Ana Maria' } },
      { changedAt: '2020-03-01', updatedBy: 'c', fields: { name: 'Ana Maria Silva' } },
    ];
    const result = diffAuditSnapshots(snapshots, SENSITIVE);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ oldValue: 'Ana', newValue: 'Ana Maria', updatedBy: 'b' });
    expect(result[1]).toMatchObject({ oldValue: 'Ana Maria', newValue: 'Ana Maria Silva', updatedBy: 'c' });
  });

  it('a single snapshot produces no diffs — there is nothing to compare it to', () => {
    expect(diffAuditSnapshots([{ changedAt: '2020-01-01', updatedBy: 'a', fields: { name: 'Ana' } }], SENSITIVE)).toEqual([]);
  });
});
