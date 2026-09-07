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
      .map((row) => ({
        row,
        score: folded ? this.matchScore(row, folded, tokens) : 0,
        distance: row.municipality ? distanceInKm(origin, row.municipality) : Number.POSITIVE_INFINITY,
      }))
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
   * Resolved through municipalities because that is where coordinates live: the
   * nearest few municipalities are found, then their localities are offered in
   * that order. A crew standing in a village gets that village's municipality
   * first and its neighbours next, which is the shortlist they actually need —
   * and it costs one small query rather than a spatial index.
   *
   * `NEAREST_MUNICIPALITIES` is 3 because a locality on a boundary can easily
   * be closer to the next council's centroid than its own.
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

    const municipalities = await this.loadMunicipalities();
    const nearest = municipalities
      .map((municipality) => ({
        municipality,
        distance: distanceInKm({ latitude, longitude }, municipality),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, NEAREST_MUNICIPALITIES);

    if (nearest.length === 0) return [];

    const rows = await this.prisma.locality.findMany({
      where: { municipalityId: { in: nearest.map((entry) => entry.municipality.id) } },
      include: { municipality: MUNICIPALITY_SELECT },
      orderBy: [{ name: 'asc' }],
    });

    // Ordered by how far their municipality is, then by name — so the closest
    // council's villages come first rather than being interleaved.
    const rank = new Map(
      nearest.map((entry, index) => [entry.municipality.id, index] as const),
    );

    return rows
      .sort(
        (a, b) =>
          (rank.get(a.municipalityId) ?? 0) - (rank.get(b.municipalityId) ?? 0) ||
          a.name.localeCompare(b.name, 'pt-PT'),
      )
      .slice(0, take)
      .map(serializeLocality);
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
   * The municipality a locality sits in, which is where its coordinate lives.
   * Used to order hospitals by distance from a report's location.
   */
  async municipalityForLocality(localityId: string): Promise<Municipality> {
    const row = await this.prisma.locality.findUnique({
      where: { id: localityId },
      include: { municipality: MUNICIPALITY_SELECT },
    });
    if (!row?.municipality) throw new NotFoundException(`Locality ${localityId} not found`);
    return serializeMunicipality(row.municipality);
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
