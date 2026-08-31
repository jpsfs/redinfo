/**
 * `migration/out/unresolved-localities.csv` — every `freguesia` value no
 * resolver tier (exact, unique-prefix, merged-freguesia, override CSV) could
 * place, with `nearestCandidates` suggestions so filling in
 * `migration/overrides/locality-map.csv` is a short lookup instead of a
 * search of ~3,259 freguesias by hand. Written once at the end of a run
 * (unlike `RejectWriter`, which streams per-row) — the resolver only knows
 * the full set once every `saidas` row has been seen.
 */
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

export interface UnresolvedLocalityRow {
  legacyText: string;
  occurrences: number;
  exampleLegacyKeys: string;
  nearestCandidates: string;
}

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function writeUnresolvedLocalitiesCsv(outDir: string, rows: UnresolvedLocalityRow[]): void {
  mkdirSync(outDir, { recursive: true });
  const header = 'legacy_text,occurrences,example_legacy_keys,nearest_candidates\n';
  const body = rows
    .map((row) =>
      [row.legacyText, String(row.occurrences), row.exampleLegacyKeys, row.nearestCandidates]
        .map(csvEscape)
        .join(','),
    )
    .join('\n');
  writeFileSync(join(outDir, 'unresolved-localities.csv'), rows.length > 0 ? `${header}${body}\n` : header, 'utf8');
}
