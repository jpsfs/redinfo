import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Hospital,
  HospitalWithDistance,
  Municipality,
  distanceInKm,
  sortHospitalsForPicker,
  validateHospital,
} from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { GeographyService, serializeMunicipality } from '../geography/geography.service';
import { CreateHospitalDto } from './dto/create-hospital.dto';
import { UpdateHospitalDto } from './dto/update-hospital.dto';

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

const HOSPITAL_INCLUDE = { municipality: MUNICIPALITY_SELECT } as const;

type HospitalRow = {
  id: string;
  name: string;
  municipalityId: string;
  latitude: number | null;
  longitude: number | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  municipality?: {
    id: string;
    ineCode: string;
    name: string;
    district: string;
    latitude: number;
    longitude: number;
  } | null;
};

export function serializeHospital(row: HospitalRow): Hospital {
  return {
    id: row.id,
    name: row.name,
    municipalityId: row.municipalityId,
    ...(row.municipality ? { municipality: serializeMunicipality(row.municipality) } : {}),
    latitude: row.latitude,
    longitude: row.longitude,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Where a hospital actually is, for measuring against.
 *
 * Its own coordinates when someone filled them in, the centroid of its
 * municipality otherwise — so distance ordering works for every hospital on
 * day one, and filling coordinates in only sharpens it. `approximate` carries
 * which of the two it was, because a UI that shows "6 km" should be able to
 * say when it means "6 km, give or take the concelho".
 */
function locate(row: HospitalRow): { latitude: number; longitude: number; approximate: boolean } | null {
  if (row.latitude !== null && row.longitude !== null) {
    return { latitude: row.latitude, longitude: row.longitude, approximate: false };
  }
  if (row.municipality) {
    return {
      latitude: row.municipality.latitude,
      longitude: row.municipality.longitude,
      approximate: true,
    };
  }
  return null;
}

/**
 * The hospital list a victim's destination is chosen from.
 *
 * Coordinator-maintained the same way holidays are — seeded with a starting
 * set, then kept in the app. Retired entries are deactivated rather than
 * deleted: a report already filed against a hospital has to keep naming it.
 */
@Injectable()
export class HospitalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geography: GeographyService,
  ) {}

  /**
   * The management list: every hospital, active first is *not* what a
   * coordinator wants — they want them where they can find them, so this is
   * ordered by district, municipality, name, and includes the inactive.
   */
  async findAll(page = 1, perPage = 100, includeInactive = true) {
    const skip = (page - 1) * perPage;
    const where = includeInactive ? {} : { isActive: true };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.hospital.findMany({
        where,
        skip,
        take: perPage,
        orderBy: [
          { municipality: { district: 'asc' } },
          { municipality: { name: 'asc' } },
          { name: 'asc' },
        ],
        include: HOSPITAL_INCLUDE,
      }),
      this.prisma.hospital.count({ where }),
    ]);

    return { data: rows.map(serializeHospital), total, page, perPage };
  }

  async findOne(id: string): Promise<Hospital> {
    const row = await this.prisma.hospital.findUnique({
      where: { id },
      include: HOSPITAL_INCLUDE,
    });
    if (!row) throw new NotFoundException(`Hospital ${id} not found`);
    return serializeHospital(row);
  }

  /**
   * The picker list: active hospitals only, nearest to the given locality
   * first.
   *
   * Distance is computed here rather than in SQL because it is measured from a
   * point that may come from either the hospital or its municipality, and
   * because 46 hospitals is a list, not a dataset — sorting it in memory is
   * simpler to read and to test than a PostGIS dependency the rest of the
   * system has no use for.
   */
  async findForPicker(localityId?: string): Promise<HospitalWithDistance[]> {
    const rows = await this.prisma.hospital.findMany({
      where: { isActive: true },
      include: HOSPITAL_INCLUDE,
    });

    let origin: Municipality | null = null;
    if (localityId) {
      // A locality that does not exist is the caller's mistake, and saying so
      // beats silently handing back an alphabetical list they did not ask for.
      origin = await this.geography.municipalityForLocality(localityId);
    }

    const withDistance: HospitalWithDistance[] = rows.map((row) => {
      const hospital = serializeHospital(row);
      const position = locate(row);
      if (!origin || !position) {
        return { ...hospital, distanceKm: null, approximate: false };
      }
      return {
        ...hospital,
        distanceKm: Math.round(distanceInKm(origin, position) * 10) / 10,
        approximate: position.approximate,
      };
    });

    return sortHospitalsForPicker(withDistance);
  }

  async create(dto: CreateHospitalDto): Promise<Hospital> {
    const input = this.normalize(dto);
    const error = validateHospital(input);
    if (error) throw new BadRequestException(error);

    await this.assertMunicipalityExists(input.municipalityId);
    await this.assertNameFree(input.name, input.municipalityId);

    const created = await this.prisma.hospital.create({
      data: {
        name: input.name,
        municipalityId: input.municipalityId,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        isActive: input.isActive ?? true,
      },
      include: HOSPITAL_INCLUDE,
    });
    return serializeHospital(created);
  }

  async update(id: string, dto: UpdateHospitalDto): Promise<Hospital> {
    const current = await this.findOne(id);

    // Validate the record as it *will* be, not the patch: "clear the latitude"
    // and "set the longitude" are only coherent together.
    const merged = this.normalize({
      name: dto.name ?? current.name,
      municipalityId: dto.municipalityId ?? current.municipalityId,
      latitude: dto.latitude !== undefined ? dto.latitude : current.latitude,
      longitude: dto.longitude !== undefined ? dto.longitude : current.longitude,
      isActive: dto.isActive !== undefined ? dto.isActive : current.isActive,
    });

    const error = validateHospital(merged);
    if (error) throw new BadRequestException(error);

    if (merged.municipalityId !== current.municipalityId) {
      await this.assertMunicipalityExists(merged.municipalityId);
    }
    if (merged.name !== current.name || merged.municipalityId !== current.municipalityId) {
      await this.assertNameFree(merged.name, merged.municipalityId, id);
    }

    const updated = await this.prisma.hospital.update({
      where: { id },
      data: {
        name: merged.name,
        municipalityId: merged.municipalityId,
        latitude: merged.latitude ?? null,
        longitude: merged.longitude ?? null,
        isActive: merged.isActive ?? true,
      },
      include: HOSPITAL_INCLUDE,
    });
    return serializeHospital(updated);
  }

  /**
   * Deactivates rather than deletes when any report names this hospital.
   *
   * A hospital nobody was ever taken to is a typo and can go; one that appears
   * in the record has to stay nameable, so "delete" means "retire" and says so.
   */
  async remove(id: string): Promise<Hospital> {
    await this.findOne(id);

    const referenced = await this.prisma.eventReportVictim.count({
      where: { destinationHospitalId: id },
    });

    if (referenced > 0) {
      const retired = await this.prisma.hospital.update({
        where: { id },
        data: { isActive: false },
        include: HOSPITAL_INCLUDE,
      });
      return serializeHospital(retired);
    }

    const deleted = await this.prisma.hospital.delete({
      where: { id },
      include: HOSPITAL_INCLUDE,
    });
    return serializeHospital(deleted);
  }

  private normalize(dto: {
    name: string;
    municipalityId: string;
    latitude?: number | null;
    longitude?: number | null;
    isActive?: boolean;
  }) {
    return {
      name: dto.name?.trim() ?? '',
      municipalityId: dto.municipalityId,
      latitude: dto.latitude ?? null,
      longitude: dto.longitude ?? null,
      isActive: dto.isActive,
    };
  }

  private async assertMunicipalityExists(municipalityId: string): Promise<void> {
    const found = await this.prisma.municipality.count({ where: { id: municipalityId } });
    if (found === 0) {
      throw new BadRequestException(`Municipality ${municipalityId} not found`);
    }
  }

  private async assertNameFree(
    name: string,
    municipalityId: string,
    exceptId?: string,
  ): Promise<void> {
    const clash = await this.prisma.hospital.findFirst({
      where: {
        name,
        municipalityId,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
    });
    if (clash) {
      throw new ConflictException(`"${name}" is already listed in that municipality`);
    }
  }
}
