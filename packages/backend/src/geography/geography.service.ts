import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  DEFAULT_DELEGATION_SETTINGS,
  LOCALITY_SEARCH_LIMIT,
  Locality,
  MAX_LOCALITY_QUERY_LENGTH,
  Municipality,
  distanceInKm,
  foldForSearch,
} from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { DelegationSettingsService } from '../live-runs/delegation-settings.service';

type MunicipalityRow = {
  id: string;
  ineCode: string;
  name: string;
  district: string;
  latitude: number;
  longitude: number;
};

type LocalityRow = {
  id: string;
  name: string;
  municipalityId: string;
  latitude?: number | null;
  longitude?: number | null;
  municipality?: MunicipalityRow | null;
};

export interface GeographyOrigin {
  latitude: number;
  longitude: number;
}

export function serializeMunicipality(row: MunicipalityRow): Municipality {
  return {
    id: row.id,
    ineCode: row.ineCode,
    name: row.name,
    district: row.district,
    latitude: row.latitude,
    longitude: row.longitude,
  };
}

export function serializeLocality(row: LocalityRow): Locality {
  return {
    id: row.id,
    name: row.name,
    municipalityId: row.municipalityId,
    ...(row.municipality ? { municipality: serializeMunicipality(row.municipality) } : {}),
  };
}

/**
 * Where a locality actually is, for distance math: its own coordinate when
 * the seed found one for it, else its municipality's centroid. A município
 * can be tens of kilometres across, so that centroid is a fallback, never
 * the first choice — the same "own point, else the area's" rule
 * `Facility.latitude/longitude` uses. `null` only when neither is known,
 * which the seed guarantees never happens for a municipality but can't
 * guarantee for every freguesia in it.
 */
export function localityPosition(row: LocalityRow): GeographyOrigin | null {
  if (typeof row.latitude === 'number' && typeof row.longitude === 'number') {
    return { latitude: row.latitude, longitude: row.longitude };
  }
  if (row.municipality) {
    return { latitude: row.municipality.latitude, longitude: row.municipality.longitude };
  }
  return null;
}

const MUNICIPALITY_SELECT = {
  select: {
    id: true,
    ineCode: true,
    name: true,
    district: true,
    latitude: true,
    longitude: true,
  },
} as const;

/**
 * Read-only access to Portugal's administrative map.
 *
 * Seeded from `prisma/data/pt-localities.json` and never written to by the
 * app — there is no create/update/delete here on purpose. A locality changing
 * name is an act of parliament, and it arrives as a new seed.
 */
@Injectable()
export class GeographyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly delegationSettings: DelegationSettingsService,
  ) {}

  /**
   * All 308 municipalities, folded for search once and cached for the process's
   * lifetime. The seed is their only writer, so there is nothing to invalidate
   * this on — a `searchName` column on `Municipality` would need a backfill
   * migration for the same result this lazily-populated field gets for free.
   */
  private municipalitiesPromise: Promise<MunicipalityRow[]> | null = null;

  private loadMunicipalities(): Promise<MunicipalityRow[]> {
    if (!this.municipalitiesPromise) {
      this.municipalitiesPromise = this.prisma.municipality.findMany(MUNICIPALITY_SELECT);
    }
    return this.municipalitiesPromise;
  }

  /**
   * Where "nearest" means, when the caller did not say: the delegation's own
   * base, falling back through `DelegationSettingsService` the same way every
   * other distance calculation in the app does.
   */
  private async resolveOrigin(origin?: GeographyOrigin): Promise<GeographyOrigin> {
    if (origin && Number.isFinite(origin.latitude) && Number.isFinite(origin.longitude)) {
      return origin;
    }
    const settings = await this.delegationSettings.get();
    return {
      latitude: settings.baseLatitude ?? DEFAULT_DELEGATION_SETTINGS.baseLatitude,
      longitude: settings.baseLongitude ?? DEFAULT_DELEGATION_SETTINGS.baseLongitude,
    };
  }

  /**
   * Localities matching a typed fragment.
   *
   * Every token of the query has to match somewhere — the locality's own
   * folded name, *or* its municipality's folded name or district — so
   * "campo barcelos" finds "União de Freguesias de Tamel S. Fins e Campo" via
   * its municipality (Barcelos) even though "barcelos" never appears in the
   * locality's own name. Word order does not matter.
   *
   * Ranked by how well the query matches, name weighted well above
   * municipality/district — see `matchScore` — with distance from `origin`
   * only as the tiebreaker. Without that weighting, searching "Vila do Conde"
   * buried the freguesia of that same name under the other two dozen
   * freguesias of Vila do Conde *município*: every one of them matched (via
   * the municipality) and, tied on distance (they share their município's
   * coordinates), the alphabetical tiebreak cut "Vila do Conde" itself before
   * the result limit. A query-less browse (empty `folded`) has no match
   * quality to rank by, so it stays plain distance order — the "nearby"
   * list the picker shows before anyone has typed anything.
   */
  async searchLocalities(
    query: string,
    limit = LOCALITY_SEARCH_LIMIT,
    origin?: GeographyOrigin,
  ): Promise<Locality[]> {
    const folded = foldForSearch((query ?? '').slice(0, MAX_LOCALITY_QUERY_LENGTH));
    const tokens = folded ? folded.split(' ') : [];
    const take = Math.max(1, Math.min(limit, LOCALITY_SEARCH_LIMIT));
    const resolvedOrigin = await this.resolveOrigin(origin);

    let where: Record<string, unknown> | undefined;
    if (folded) {
      const municipalities = await this.loadMunicipalities();
      where = {
        AND: tokens.map((token) => {
          const municipalityIds = municipalities
            .filter(
              (municipality) =>
                foldForSearch(municipality.name).includes(token) ||
                foldForSearch(municipality.district).includes(token),
            )
            .map((municipality) => municipality.id);
          // An empty `in: []` must not accidentally match every row — Prisma
          // treats it as "matches nothing", which is exactly what is wanted
          // when no municipality's name or district carries this token.
          return {
            OR: [{ searchName: { contains: token } }, { municipalityId: { in: municipalityIds } }],
          };
        }),
      };
    }

    const rows = await this.prisma.locality.findMany({
      where,
      include: { municipality: MUNICIPALITY_SELECT },
    });

    return this.rankByRelevance(rows, folded, tokens, resolvedOrigin, take);
  }

  /** How much of a token's credit a match in the locality's own name earns, vs. its municipality/district. */
  private static readonly NAME_TOKEN_WEIGHT = 3;
  private static readonly MUNICIPALITY_TOKEN_WEIGHT = 1;

  /**
   * A relevance score for one row against the typed query — higher is a
   * better match. Every token that reached this row matched the locality's
   * own name, or its municipality's name/district (that's what the caller's
   * `where` clause guaranteed); this just weighs *which* it was, per token,
   * so a locality whose own name carries the words outranks one that only
   * shares a município with them. A small bonus on top rewards the name
   * matching the query as a whole (prefix or exact), so "Vila do Conde" the
   * freguesia sits above "Vila Chã" (also in that município, also starting
   * with "vila") when both searches are for "vila do conde".
   */
  private matchScore(row: LocalityRow, folded: string, tokens: string[]): number {
    const name = foldForSearch(row.name);
    const municipality = row.municipality ? foldForSearch(row.municipality.name) : '';
    const district = row.municipality ? foldForSearch(row.municipality.district) : '';

    const tokenScore = tokens.reduce((total, token) => {
      if (name.includes(token)) return total + GeographyService.NAME_TOKEN_WEIGHT;
      if (municipality.includes(token) || district.includes(token)) {
        return total + GeographyService.MUNICIPALITY_TOKEN_WEIGHT;
      }
      return total;
    }, 0);

    const wholeQueryBonus = name === folded ? 3 : name.startsWith(folded) ? 2 : name.includes(folded) ? 1 : 0;

    return tokenScore * 10 + wholeQueryBonus;
  }

  private rankByRelevance<T extends LocalityRow>(
    rows: T[],
    folded: string,
    tokens: string[],
    origin: GeographyOrigin,
    take: number,
  ): Locality[] {
    return rows
      .map((row) => {
        const position = localityPosition(row);
        return {
          row,
          score: folded ? this.matchScore(row, folded, tokens) : 0,
          distance: position ? distanceInKm(origin, position) : Number.POSITIVE_INFINITY,
        };
      })
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.distance - b.distance ||
          a.row.name.localeCompare(b.row.name, 'pt-PT'),
      )
      .slice(0, take)
      .map((entry) => serializeLocality(entry.row));
  }

  /**
   * Localities near a point, nearest first — what "use my location" offers.
   *
   * The *candidate pool* is resolved through municipalities, because that
   * bounds the query to one small `IN` lookup rather than a spatial index:
   * the nearest few municipalities (by centroid) are found first, and every
   * freguesia inside them is a candidate. `NEAREST_MUNICIPALITIES` is 3
   * rather than 1 because a locality on a boundary can easily sit in a
   * município whose *centroid* is not the nearest one.
   *
   * The final *order*, though, is each candidate's own precise distance
   * (`localityPosition` — its own coordinate, falling back to its
   * municipality's) — not the municipality's rank. Two freguesias of the same
   * município are not equally close just because they share a council.
   */
  async nearestLocalities(
    latitude: number,
    longitude: number,
    limit = LOCALITY_SEARCH_LIMIT,
  ): Promise<Locality[]> {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new BadRequestException('Latitude and longitude must be numbers.');
    }
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      throw new BadRequestException('Latitude or longitude is off the globe.');
    }

    const NEAREST_MUNICIPALITIES = 3;
    const take = Math.max(1, Math.min(limit, LOCALITY_SEARCH_LIMIT));
    const point = { latitude, longitude };

    const municipalities = await this.loadMunicipalities();
    const nearest = municipalities
      .map((municipality) => ({ municipality, distance: distanceInKm(point, municipality) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, NEAREST_MUNICIPALITIES);

    if (nearest.length === 0) return [];

    const rows = await this.prisma.locality.findMany({
      where: { municipalityId: { in: nearest.map((entry) => entry.municipality.id) } },
      include: { municipality: MUNICIPALITY_SELECT },
    });

    return rows
      .map((row) => {
        const position = localityPosition(row);
        return { row, distance: position ? distanceInKm(point, position) : Number.POSITIVE_INFINITY };
      })
      .sort((a, b) => a.distance - b.distance || a.row.name.localeCompare(b.row.name, 'pt-PT'))
      .slice(0, take)
      .map((entry) => serializeLocality(entry.row));
  }

  async findLocality(id: string): Promise<Locality> {
    const row = await this.prisma.locality.findUnique({
      where: { id },
      include: { municipality: MUNICIPALITY_SELECT },
    });
    if (!row) throw new NotFoundException(`Locality ${id} not found`);
    return serializeLocality(row);
  }

  /**
   * Where a locality is, for distance math — its own coordinate, falling back
   * to its municipality's centroid (`localityPosition`). Used to order
   * hospitals by distance from a report's location.
   */
  async originForLocality(localityId: string): Promise<GeographyOrigin> {
    const row = await this.prisma.locality.findUnique({
      where: { id: localityId },
      include: { municipality: MUNICIPALITY_SELECT },
    });
    if (!row) throw new NotFoundException(`Locality ${localityId} not found`);
    const position = localityPosition(row);
    if (!position) throw new NotFoundException(`Locality ${localityId} has no known position`);
    return position;
  }

  /** Every municipality, for the hospital form's picker. 308 rows, unpaged. */
  async listMunicipalities(): Promise<Municipality[]> {
    const rows = await this.prisma.municipality.findMany({
      orderBy: [{ district: 'asc' }, { name: 'asc' }],
      ...MUNICIPALITY_SELECT,
    });
    return rows.map(serializeMunicipality);
  }
}
