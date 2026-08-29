/**
 * The pure half of the three-tier locality resolver (plan §5.4). The impure
 * half — the actual `Locality.findMany` calls, the overrides CSV, and the
 * final "reject to unresolved-localities.csv" — lives in
 * `resolvers/locality.resolver.ts`; everything that can be decided from a
 * folded string and a candidate list lives here, so it can be tested with no
 * database at all.
 *
 * `EventReport.localityId` is NOT NULL with `onDelete: Restrict`, so there is
 * no partial import for a report whose locality cannot be pinned down —
 * ambiguity here is a fact to report, never something to guess past.
 */
import { foldForSearch } from '@redinfo/shared';

export interface LocalityCandidate {
  id: string;
  name: string;
  /** Pre-folded, matching the `searchName` column written by the geography seed. */
  searchName: string;
  municipalityName: string;
}

export type LocalityResolution =
  | { kind: 'EXACT'; candidate: LocalityCandidate }
  | { kind: 'UNIQUE_PREFIX'; candidate: LocalityCandidate }
  | { kind: 'AMBIGUOUS'; candidates: LocalityCandidate[] }
  | { kind: 'NONE' };

/**
 * Tier 1 (exact fold match) then tier 2 (unique fold-prefix match). Tier 3
 * (the overrides CSV) and tier 4 (reject) are not string-matching problems,
 * so they are not this function's concern.
 */
export function resolveLocalityCandidates(
  freguesia: string,
  candidates: readonly LocalityCandidate[],
): LocalityResolution {
  const folded = foldForSearch(freguesia);

  const exact = candidates.filter((c) => c.searchName === folded);
  if (exact.length === 1) return { kind: 'EXACT', candidate: exact[0] };
  if (exact.length > 1) return { kind: 'AMBIGUOUS', candidates: exact };

  const prefixed = candidates.filter((c) => c.searchName.startsWith(folded));
  if (prefixed.length === 1) return { kind: 'UNIQUE_PREFIX', candidate: prefixed[0] };
  if (prefixed.length > 1) return { kind: 'AMBIGUOUS', candidates: prefixed };

  return { kind: 'NONE' };
}

/**
 * Top `limit` candidates by folded-token overlap with `freguesia` — the
 * `nearest_candidates` column of `unresolved-localities.csv`, which is what
 * turns filling in the override CSV into a short lookup instead of a search
 * of 3,259 freguesias by hand.
 */
export function nearestCandidates(
  freguesia: string,
  candidates: readonly LocalityCandidate[],
  limit = 3,
): LocalityCandidate[] {
  const inputTokens = new Set(foldForSearch(freguesia).split(' ').filter(Boolean));

  return candidates
    .map((candidate) => {
      const tokens = new Set(candidate.searchName.split(' ').filter(Boolean));
      const overlap = [...inputTokens].filter((token) => tokens.has(token)).length;
      return { candidate, overlap };
    })
    .filter((scored) => scored.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap || a.candidate.name.localeCompare(b.candidate.name))
    .slice(0, limit)
    .map((scored) => scored.candidate);
}
