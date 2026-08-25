import { PrismaService } from '../prisma/prisma.service';

/**
 * Fields whose *value* never goes in the audit trail — only that they
 * changed. The trail is a record that something happened, not a second copy
 * of sensitive data.
 */
const SENSITIVE_FIELDS = new Set<string>([
  'nif',
  'citizenCardNumber',
  'bloodType',
  'emergencyContactName',
  'emergencyContactPhone',
  'birthDate',
]);

function normalize(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/**
 * Actor-and-timestamp trail for personnel profile changes.
 *
 * Takes the whole before/after snapshot and figures out what actually
 * changed, rather than asking each caller to diff by hand — so a coordinator
 * PATCHing five fields and changing two gets exactly two rows.
 */
export async function recordProfileChanges(
  prisma: PrismaService,
  params: {
    userId: string;
    changedById: string;
    fields: string[];
    before: Record<string, unknown>;
    after: Record<string, unknown>;
  },
): Promise<void> {
  const rows = params.fields
    .map((field) => ({ field, oldValue: normalize(params.before[field]), newValue: normalize(params.after[field]) }))
    .filter((row) => row.oldValue !== row.newValue)
    .map((row) => ({
      userId: params.userId,
      changedById: params.changedById,
      field: row.field,
      oldValue: SENSITIVE_FIELDS.has(row.field) ? null : row.oldValue,
      newValue: SENSITIVE_FIELDS.has(row.field) ? null : row.newValue,
    }));

  if (rows.length === 0) return;
  await prisma.userProfileAudit.createMany({ data: rows });
}
