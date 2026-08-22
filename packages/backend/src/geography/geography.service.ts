import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  LOCALITY_SEARCH_LIMIT,
  Locality,
  MAX_LOCALITY_QUERY_LENGTH,
  Municipality,
  distanceInKm,
  foldForSearch,
} from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';

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
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Localities matching a typed fragment, best match first.
   *
   * Every token of the query has to appear somewhere in the folded name, so
   * "martinho bispo" finds "São Martinho do Bispo" and word order does not
   * matter. Names that *start* with the query are offered before names that
   * merely contain it: someone typing "coimbra" wants Coimbra, not
   * "Vila Nova de Coimbra".
   */
  async searchLocalities(query: string, limit = LOCALITY_SEARCH_LIMIT): Promise<Locality[]> {
    const folded = foldForSearch((query ?? '').slice(0, MAX_LOCALITY_QUERY_LENGTH));
    const take = Math.max(1, Math.min(limit, LOCALITY_SEARCH_LIMIT));

    if (!folded) {
      // No query: the alphabetical head of the list, so the picker is never
      // an empty box waiting to be typed into.
      const rows = await this.prisma.locality.findMany({
        take,
        orderBy: [{ name: 'asc' }],
        include: { municipality: MUNICIPALITY_SELECT },
      });
      return rows.map(serializeLocality);
    }

    const tokens = folded.split(' ');
    // Over-fetch so the prefix-first ranking below has something to reorder:
    // the database can filter, but "starts with" beats "contains" is a
    // judgement about relevance, and it is cheaper to make it here than to
    // express it in two queries.
    const rows = await this.prisma.locality.findMany({
      where: { AND: tokens.map((token) => ({ searchName: { contains: token } })) },
      take: take * 4,
      orderBy: [{ name: 'asc' }],
      include: { municipality: MUNICIPALITY_SELECT },
    });

    const ranked = rows
      .map((row) => ({
        row,
        rank: row.searchName.startsWith(folded) ? 0 : 1,
      }))
      .sort((a, b) => a.rank - b.rank || a.row.name.localeCompare(b.row.name, 'pt-PT'))
      .slice(0, take);

    return ranked.map((entry) => serializeLocality(entry.row));
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

    const municipalities = await this.prisma.municipality.findMany(MUNICIPALITY_SELECT);
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
