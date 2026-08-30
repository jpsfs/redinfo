/**
 * The impure half of the locality resolver (plan §5.4). Tiers 1–2 (exact
 * fold, unique prefix) and tier 2.5 (merged-freguesia matching, for a
 * pre-2013 name folded into a "União das Freguesias de ..." locality) all
 * delegate to `transform/locality.ts`'s pure logic; tier 3 is the
 * hand-maintained overrides CSV; tier 4 is "give up and remember it for
 * `unresolved-localities.csv`".
 *
 * Every result — resolved or not — is memoised on the folded input for the
 * lifetime of one run: 1,835 `saidas` rows name far fewer than 1,835 distinct
 * freguesias, and there is no reason to ask Postgres the same question twice.
 * Occurrence counts (for reporting) are still tracked on every call, cache
 * hit or not — only the Postgres round-trip is skipped.
 */
import { readFileSync } from 'fs';
import { PrismaClient } from '@prisma/client';
import { foldForSearch } from '@redinfo/shared';
import { LEGACY_DELEGATION_MUNICIPALITY, LEGACY_NEIGHBOURING_MUNICIPALITIES } from '../mapping.config';
import {
  LocalityCandidate,
  MergedFreguesiaIndex,
  MergedFreguesiaResolution,
  buildMergedFreguesiaIndex,
  nearestCandidates,
  resolveLocalityCandidates,
  resolveMergedFreguesia,
} from '../transform/locality';

export interface LocalityOverride {
  localityId: string;
  note: string;
}

/**
 * `migration/overrides/locality-map.csv` — header `legacy_text,localityId,note`.
 * A minimal hand-rolled parser rather than a CSV dependency: three plain
 * columns, no embedded commas expected in `legacy_text`/`note` in practice,
 * and one fewer dependency to add for a migration-only script.
 */
export function loadLocalityOverrides(path: string): Map<string, LocalityOverride> {
  const overrides = new Map<string, LocalityOverride>();
  let content: string;
  try {
    content = readFileSync(path, 'utf8');
  } catch {
    return overrides; // No overrides file yet is not an error — nothing has been resolved by hand.
  }

  const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);
  const [header, ...rows] = lines;
  if (!header?.startsWith('legacy_text,localityId,note')) {
    throw new Error(`${path}: expected header "legacy_text,localityId,note".`);
  }

  for (const row of rows) {
    const [legacyText, localityId, ...noteParts] = row.split(',');
    if (!legacyText || !localityId) continue;
    overrides.set(foldForSearch(legacyText), { localityId, note: noteParts.join(',') });
  }
  return overrides;
}

export interface UnresolvedLocality {
  /** The raw (unfolded) legacy text, as first seen — what a human needs to add an override row. */
  legacyText: string;
  occurrences: number;
  exampleLegacyKeys: Set<string>;
}

export interface MergedFreguesiaMatch {
  legacyText: string;
  resolvedTo: string;
  municipality: string;
  tiebreak: MergedFreguesiaResolution['tiebreak'];
  occurrences: number;
}

export class LocalityResolver {
  private candidates: LocalityCandidate[] | null = null;
  private mergedIndex: MergedFreguesiaIndex | null = null;
  private readonly resultCache = new Map<string, string | null>();
  readonly unresolved = new Map<string, UnresolvedLocality>();
  /** Tier 2.5 hits, keyed by the folded input so a repeated legacy text is counted once. */
  readonly mergedFreguesiaMatches = new Map<string, MergedFreguesiaMatch>();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly overrides: Map<string, LocalityOverride>,
  ) {}

  private async loadCandidates(): Promise<LocalityCandidate[]> {
    if (this.candidates) return this.candidates;
    const rows = await this.prisma.locality.findMany({ include: { municipality: true } });
    this.candidates = rows.map((row) => ({
      id: row.id,
      name: row.name,
      searchName: row.searchName,
      municipalityName: row.municipality.name,
    }));
    this.mergedIndex = buildMergedFreguesiaIndex(this.candidates);
    return this.candidates;
  }

  async resolve(freguesia: string, exampleLegacyKey: string): Promise<string | null> {
    const folded = foldForSearch(freguesia);

    // The result is memoised on the folded input for the lifetime of a run,
    // but the *occurrence counts* below must not be — a cache hit is still
    // one more `saidas` row naming this freguesia, and `report.md` /
    // `unresolved-localities.csv` need the true count, not "however many
    // times we happened to ask Postgres".
    if (this.resultCache.has(folded)) {
      this.recordRepeatOccurrence(folded, exampleLegacyKey);
      return this.resultCache.get(folded)!;
    }

    const candidates = await this.loadCandidates();
    const resolution = resolveLocalityCandidates(freguesia, candidates);
    if (resolution.kind === 'EXACT' || resolution.kind === 'UNIQUE_PREFIX') {
      this.resultCache.set(folded, resolution.candidate.id);
      return resolution.candidate.id;
    }

    // Tier 2.5 — a pre-2013 freguesia name merged into a "União das
    // Freguesias de ..." locality (see transform/locality.ts). Only reached
    // once tiers 1-2 have already failed, so it never overrides an outright
    // match, and it is always logged (never silent) so a coordinator can spot
    // a wrong guess in `report.md` and fix it via the override CSV.
    const known = resolution.kind === 'AMBIGUOUS' ? resolution.candidates : [];
    const merged = resolveMergedFreguesia(
      freguesia,
      known,
      this.mergedIndex!,
      LEGACY_DELEGATION_MUNICIPALITY,
      LEGACY_NEIGHBOURING_MUNICIPALITIES,
    );
    if (merged) {
      this.mergedFreguesiaMatches.set(folded, {
        legacyText: freguesia,
        resolvedTo: merged.candidate.name,
        municipality: merged.candidate.municipalityName,
        tiebreak: merged.tiebreak,
        occurrences: 1,
      });
      this.resultCache.set(folded, merged.candidate.id);
      return merged.candidate.id;
    }

    const override = this.overrides.get(folded);
    if (override) {
      this.resultCache.set(folded, override.localityId);
      return override.localityId;
    }

    this.unresolved.set(folded, { legacyText: freguesia, occurrences: 1, exampleLegacyKeys: new Set([exampleLegacyKey]) });
    this.resultCache.set(folded, null);
    return null;
  }

  /** Bumps whichever bucket a repeated (cache-hit) freguesia value already landed in, if any. */
  private recordRepeatOccurrence(folded: string, exampleLegacyKey: string): void {
    const merged = this.mergedFreguesiaMatches.get(folded);
    if (merged) {
      merged.occurrences += 1;
      return;
    }
    const unresolved = this.unresolved.get(folded);
    if (unresolved) {
      unresolved.occurrences += 1;
      unresolved.exampleLegacyKeys.add(exampleLegacyKey);
    }
  }

  /** `migration/out/unresolved-localities.csv` — everything left after every tier, with lookup help. */
  async unresolvedReport(): Promise<Array<{ legacyText: string; occurrences: number; exampleLegacyKeys: string; nearestCandidates: string }>> {
    const candidates = await this.loadCandidates();
    return [...this.unresolved.entries()]
      .sort((a, b) => b[1].occurrences - a[1].occurrences)
      .map(([, entry]) => ({
        legacyText: entry.legacyText,
        occurrences: entry.occurrences,
        exampleLegacyKeys: [...entry.exampleLegacyKeys].slice(0, 5).join('; '),
        nearestCandidates: nearestCandidates(entry.legacyText, candidates)
          .map((c) => `${c.name} (${c.municipalityName})`)
          .join(' | '),
      }));
  }
}
