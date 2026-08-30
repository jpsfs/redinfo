/**
 * Field-level diffing for `UserProfileAudit` (plan §5.3 loader 14, Q6
 * resolved — both `socorrista_hist` and `usuarios_hist` are in scope).
 *
 * A legacy `*_hist` table is a row-per-change audit trail: each row is the
 * state as of `update_date`. Diffing consecutive snapshots (ordered by
 * `changedAt`, with the *current* live row appended as the final snapshot)
 * produces exactly the sequence of field-level changes `UserProfileAudit`
 * exists to record — one entry per field that actually changed between two
 * consecutive snapshots, attributed to the snapshot that captured the new
 * value.
 *
 * Pure: takes and returns plain data, no Prisma, no `Date.now()`. The loader
 * builds the snapshots (resolving `userId`/`changedById` along the way) and
 * calls this.
 */

export interface AuditSnapshot {
  /** The legacy timestamp this snapshot was captured at. */
  changedAt: string;
  /** Legacy `updated_by` username, or null — the loader resolves this to a `User.id` separately. */
  updatedBy: string | null;
  /** Field name (matching `SENSITIVE_AUDIT_FIELDS` where applicable) → its value at this snapshot, already transformed. */
  fields: Record<string, string | null>;
}

export interface AuditDiffEntry {
  field: string;
  /** Null when `field` is sensitive — `UserProfileAudit` records that a change happened, not what changed. */
  oldValue: string | null;
  newValue: string | null;
  changedAt: string;
  updatedBy: string | null;
}

/**
 * One entry per field that differs between each consecutive pair of
 * snapshots. A field present in one snapshot's `fields` and absent from the
 * other's is treated as null on the absent side — a field appearing for the
 * first time, or disappearing, is still a change worth recording.
 */
export function diffAuditSnapshots(
  snapshots: readonly AuditSnapshot[],
  sensitiveFields: ReadonlySet<string>,
): AuditDiffEntry[] {
  const entries: AuditDiffEntry[] = [];

  for (let i = 1; i < snapshots.length; i += 1) {
    const previous = snapshots[i - 1];
    const current = snapshots[i];
    const fieldNames = new Set([...Object.keys(previous.fields), ...Object.keys(current.fields)]);

    for (const field of fieldNames) {
      const oldRaw = previous.fields[field] ?? null;
      const newRaw = current.fields[field] ?? null;
      if (oldRaw === newRaw) continue;

      const sensitive = sensitiveFields.has(field);
      entries.push({
        field,
        oldValue: sensitive ? null : oldRaw,
        newValue: sensitive ? null : newRaw,
        changedAt: current.changedAt,
        updatedBy: current.updatedBy,
      });
    }
  }

  return entries;
}
