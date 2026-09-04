/**
 * `migration/out/report.md` — the deliverable a human actually reads.
 * Overwrite summary first (the brief's headline requirement), then
 * everything a coordinator needs to decide whether to `--apply`.
 */
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Counters } from './counters';
import { PruneOutcome } from '../prune';

export interface ReportData {
  runId: string;
  mode: 'dry-run' | 'apply';
  startedAt: string;
  finishedAt: string;
  gitSha: string;
  counters: Counters;
  rejectEntities: string[];
  /** Tables named in decision 8 / plan finding F2 — no legacy source exists at all. */
  notMigrated: Array<{ table: string; reason: string }>;
  placeholderEmails: Array<{ legacyKey: string; email: string; reason: string }>;
  defaultedVolunteerRoles: Array<{ name: string; email: string }>;
  vehiclesWithSentinelDates: string[];
  nonConformingPlates: Array<{ legacyKey: string; value: string }>;
  assumedSubmittedAt: Array<{ legacyKey: string; date: string; source: string }>;
  /** One entry per entity the prune sweep considered — see `prune.ts`. */
  pruned: PruneOutcome[];
  mergedFreguesiaMatches: Array<{ legacyText: string; resolvedTo: string; municipality: string; tiebreak: string; occurrences: number }>;
  unresolvedLocalityCount: number;
  truncatedNarratives: string[];
  unmappedEnumCodes: Array<{ table: string; code: string; count: number; question?: string }>;
  droppedColumns: Array<{ table: string; columns: string[] }>;
}

function table(headers: string[], rows: string[][]): string {
  if (rows.length === 0) return '_None._\n';
  const headerLine = `| ${headers.join(' | ')} |`;
  const separator = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${row.join(' | ')} |`).join('\n');
  return `${headerLine}\n${separator}\n${body}\n`;
}

export function renderReport(data: ReportData): string {
  const sections: string[] = [];

  sections.push(`# Legacy migration report\n`);
  sections.push(
    [
      `- **Run id:** ${data.runId}`,
      `- **Mode:** ${data.mode === 'apply' ? 'APPLY (committed)' : 'DRY RUN (rolled back — nothing was written)'}`,
      `- **Started:** ${data.startedAt}`,
      `- **Finished:** ${data.finishedAt}`,
      `- **Git sha:** ${data.gitSha}`,
    ].join('\n') + '\n',
  );

  sections.push('## Overwrite summary\n');
  sections.push(`**${data.counters.totalUpdated()} existing row(s) would be overwritten by this run.**\n`);
  sections.push(`**${data.counters.totalDeleted()} existing row(s) would be deleted** — see Retractions below.\n`);
  sections.push(
    table(
      ['Entity', 'Created', 'Adopted', 'Updated', 'Unchanged', 'Rejected', 'Deleted'],
      data.counters
        .entities()
        .sort()
        .map((entity) => {
          const c = data.counters.get(entity);
          return [
            entity,
            String(c.created),
            String(c.adopted),
            String(c.updated),
            String(c.unchanged),
            String(c.rejected),
            String(c.deleted),
          ];
        }),
    ),
  );

  sections.push('## Retractions (rows legacy no longer has)\n');
  sections.push(
    'A mapping `LegacyIdMap` still holds but this run\'s source never produced again — somebody cleared ' +
      'a crew slot or removed an availability row in legacy. `prune.ts` deletes those here, unless one of ' +
      'its guards says the absence is more likely an incomplete extract.\n',
  );
  sections.push(
    table(
      ['Entity', 'Mapped', 'Missing from source', 'Deleted', 'Skipped because'],
      data.pruned.map((p) => [
        p.entity,
        String(p.mapped),
        String(p.stale),
        String(p.deleted),
        p.skippedReason ?? '—',
      ]),
    ),
  );

  sections.push('## Rejects\n');
  sections.push(
    data.rejectEntities.length > 0
      ? data.rejectEntities.map((entity) => `- \`rejects-${entity}.csv\``).join('\n') + '\n'
      : '_No rejects._\n',
  );

  sections.push('## Defaulted to EMERGENCY_OPERATIONAL (decision 10)\n');
  sections.push(
    table(
      ['Name', 'Email'],
      data.defaultedVolunteerRoles.map((r) => [r.name, r.email]),
    ),
  );

  sections.push('## Placeholder emails issued (decision 9)\n');
  sections.push(
    table(
      ['Legacy key', 'Email', 'Reason'],
      data.placeholderEmails.map((r) => [r.legacyKey, r.email, r.reason]),
    ),
  );

  sections.push('## Vehicles given the 1970-01-01 sentinel date\n');
  sections.push(
    data.vehiclesWithSentinelDates.length > 0
      ? data.vehiclesWithSentinelDates.map((v) => `- ${v}`).join('\n') + '\n'
      : '_None._\n',
  );

  sections.push('## Event reports given a fallback submittedAt (create_date sentinel)\n');
  sections.push(
    table(
      ['Legacy key', 'Date used', 'Source'],
      data.assumedSubmittedAt.map((r) => [r.legacyKey, r.date, r.source]),
    ),
  );

  sections.push('## Localities resolved via merged-freguesia matching (tier 2.5)\n');
  sections.push(
    `A pre-2013 freguesia name with no exact match, resolved by finding the "União das Freguesias de ..." ` +
      `it was merged into (Lei n.º 11-A/2013) and, where that was still ambiguous across municipalities, ` +
      `breaking the tie toward the delegation's own municipality or a confirmed neighbour. Every row here is a ` +
      `guess, not a certainty — spot-check before trusting it, and correct it via ` +
      `\`migration/overrides/locality-map.csv\` if wrong.\n`,
  );
  sections.push(
    table(
      ['Legacy text', 'Resolved to', 'Municipality', 'Tiebreak', 'Occurrences'],
      data.mergedFreguesiaMatches.map((m) => [m.legacyText, m.resolvedTo, m.municipality, m.tiebreak, String(m.occurrences)]),
    ),
  );

  sections.push('## Unresolved localities\n');
  sections.push(
    data.unresolvedLocalityCount > 0
      ? `${data.unresolvedLocalityCount} distinct freguesia value(s) matched nothing — see \`unresolved-localities.csv\` ` +
          `for nearest-candidate suggestions to add to \`migration/overrides/locality-map.csv\`.\n`
      : '_None._\n',
  );

  sections.push('## Non-conforming licence plates\n');
  sections.push(
    table(
      ['Legacy key', 'Value'],
      data.nonConformingPlates.map((p) => [p.legacyKey, p.value]),
    ),
  );

  sections.push('## Truncated narratives\n');
  sections.push(
    data.truncatedNarratives.length > 0
      ? data.truncatedNarratives.map((r) => `- ${r}`).join('\n') + '\n'
      : '_None._\n',
  );

  sections.push('## Unmapped enum codes\n');
  sections.push(
    table(
      ['Table', 'Code', 'Count', 'Open question'],
      data.unmappedEnumCodes.map((u) => [u.table, u.code, String(u.count), u.question ?? '—']),
    ),
  );

  sections.push('## Not migrated (no legacy source, or explicitly out of scope)\n');
  sections.push(
    table(
      ['Table', 'Reason'],
      data.notMigrated.map((n) => [n.table, n.reason]),
    ),
  );

  sections.push('## Dropped columns\n');
  sections.push(
    table(
      ['Table', 'Columns'],
      data.droppedColumns.map((d) => [d.table, d.columns.join(', ')]),
    ),
  );

  return sections.join('\n');
}

export function writeReport(outDir: string, data: ReportData): void {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'report.md'), renderReport(data), 'utf8');
}
