/**
 * The impure half of the three-tier locality resolver (plan §5.4). Tiers 1–2
 * (exact fold, unique prefix) delegate to `transform/locality.ts`'s pure
 * logic; tier 3 is the hand-maintained overrides CSV; tier 4 is "give up and
 * remember it for `unresolved-localities.csv`".
 *
 * Every result — resolved or not — is memoised on the folded input for the
 * lifetime of one run: 1,835 `saidas` rows name far fewer than 1,835 distinct
 * freguesias, and there is no reason to ask Postgres the same question twice.
 */
import { readFileSync } from 'fs';
import { PrismaClient } from '@prisma/client';
import { foldForSearch } from '@redinfo/shared';
import { LocalityCandidate, resolveLocalityCandidates } from '../transform/locality';

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
  occurrences: number;
  exampleLegacyKeys: Set<string>;
}

export class LocalityResolver {
  private candidates: LocalityCandidate[] | null = null;
  private readonly resultCache = new Map<string, string | null>();
  readonly unresolved = new Map<string, UnresolvedLocality>();

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
    return this.candidates;
  }

  async resolve(freguesia: string, exampleLegacyKey: string): Promise<string | null> {
    const folded = foldForSearch(freguesia);
    if (this.resultCache.has(folded)) return this.resultCache.get(folded)!;

    const candidates = await this.loadCandidates();
    const resolution = resolveLocalityCandidates(freguesia, candidates);
    if (resolution.kind === 'EXACT' || resolution.kind === 'UNIQUE_PREFIX') {
      this.resultCache.set(folded, resolution.candidate.id);
      return resolution.candidate.id;
    }

    const override = this.overrides.get(folded);
    if (override) {
      this.resultCache.set(folded, override.localityId);
      return override.localityId;
    }

    const entry = this.unresolved.get(folded) ?? { occurrences: 0, exampleLegacyKeys: new Set<string>() };
    entry.occurrences += 1;
    entry.exampleLegacyKeys.add(exampleLegacyKey);
    this.unresolved.set(folded, entry);
    this.resultCache.set(folded, null);
    return null;
  }
}
