import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Facility,
  FacilityWithDistance,
  distanceInKm,
  sortFacilitiesForPicker,
  validateFacility,
} from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { GeographyOrigin, GeographyService, serializeMunicipality } from '../geography/geography.service';
import { CreateFacilityDto } from './dto/create-facility.dto';
import { UpdateFacilityDto } from './dto/update-facility.dto';

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

const FACILITY_INCLUDE = { municipality: MUNICIPALITY_SELECT } as const;

type FacilityRow = {
  id: string;
  name: string;
  municipalityId: string;
  addressLine: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  isEmergencyDestination: boolean;
  isTransportDestination: boolean;
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

export function serializeFacility(row: FacilityRow): Facility {
  return {
    id: row.id,
    name: row.name,
    municipalityId: row.municipalityId,
    ...(row.municipality ? { municipality: serializeMunicipality(row.municipality) } : {}),
    addressLine: row.addressLine,
    postalCode: row.postalCode,
    latitude: row.latitude,
    longitude: row.longitude,
    isEmergencyDestination: row.isEmergencyDestination,
    isTransportDestination: row.isTransportDestination,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Where a facility actually is, for measuring against.
 *
 * Its own coordinates when someone filled them in, the centroid of its
 * municipality otherwise — so distance ordering works for every emergency
 * destination on day one, and filling coordinates in only sharpens it. A
 * transport destination is never missing its own coordinates in the first
 * place — `validateFacility` refuses to save one without them — so this
 * fallback only ever fires for the emergency side.
 */
function locate(row: FacilityRow): { latitude: number; longitude: number; approximate: boolean } | null {
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
 * Destinations a victim or a transport can be sent to: hospitals, clinics and
 * private medical facilities, one table shared by two independent lists.
 * Coordinator-maintained the same way holidays are — seeded with a starting
 * set, then kept in the app. Retired entries are deactivated rather than
 * deleted: a report already filed against a facility has to keep naming it.
 *
 * Deliberately no `findAll`: a method that does not exist cannot be called by
 * accident from a picker that has no business seeing the other list. Every
 * accessor here filters by at least one of `isEmergencyDestination` /
 * `isTransportDestination` — `findManaged` (the admin CRUD list) included,
 * since `validateFacility` refuses to save a row with both false, so that
 * pair of filters is never narrower than "everything manageable".
 */
@Injectable()
export class FacilitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geography: GeographyService,
  ) {}

  /**
   * The admin management list: every facility carrying at least one
   * destination flag, active first is *not* what a coordinator wants — they
   * want them where they can find them, so this is ordered by district,
   * municipality, name, and includes the inactive.
   */
  async findManaged(page = 1, perPage = 100, includeInactive = true) {
    const skip = (page - 1) * perPage;
    const where = {
      OR: [{ isEmergencyDestination: true }, { isTransportDestination: true }],
      ...(includeInactive ? {} : { isActive: true }),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.facility.findMany({
        where,
        skip,
        take: perPage,
        orderBy: [
          { municipality: { district: 'asc' } },
          { municipality: { name: 'asc' } },
          { name: 'asc' },
        ],
        include: FACILITY_INCLUDE,
      }),
      this.prisma.facility.count({ where }),
    ]);

    return { data: rows.map(serializeFacility), total, page, perPage };
  }

  async findOne(id: string): Promise<Facility> {
    const row = await this.prisma.facility.findUnique({
      where: { id },
      include: FACILITY_INCLUDE,
    });
    if (!row) throw new NotFoundException(`Facility ${id} not found`);
    return serializeFacility(row);
  }

  /** The emergency picker: active emergency destinations, nearest first. */
  async findEmergencyDestinations(localityId?: string): Promise<FacilityWithDistance[]> {
    return this.findForPicker('isEmergencyDestination', localityId);
  }

  /** The transport picker: active transport destinations, nearest first. */
  async findTransportDestinations(localityId?: string): Promise<FacilityWithDistance[]> {
    return this.findForPicker('isTransportDestination', localityId);
  }

  private async findForPicker(
    flag: 'isEmergencyDestination' | 'isTransportDestination',
    localityId?: string,
  ): Promise<FacilityWithDistance[]> {
    const rows = await this.prisma.facility.findMany({
      where: { isActive: true, [flag]: true },
      include: FACILITY_INCLUDE,
    });

    let origin: GeographyOrigin | null = null;
    if (localityId) {
      // A locality that does not exist is the caller's mistake, and saying so
      // beats silently handing back an alphabetical list they did not ask for.
      origin = await this.geography.originForLocality(localityId);
    }

    const withDistance: FacilityWithDistance[] = rows.map((row) => {
      const facility = serializeFacility(row);
      const position = locate(row);
      if (!origin || !position) {
        return { ...facility, distanceKm: null, approximate: false };
      }
      return {
        ...facility,
        distanceKm: Math.round(distanceInKm(origin, position) * 10) / 10,
        approximate: position.approximate,
      };
    });

    return sortFacilitiesForPicker(withDistance);
  }

  async create(dto: CreateFacilityDto): Promise<Facility> {
    const input = this.normalize(dto);
    const error = validateFacility(input);
    if (error) throw new BadRequestException(error);

    await this.assertMunicipalityExists(input.municipalityId);
    await this.assertNameFree(input.name, input.municipalityId);

    const created = await this.prisma.facility.create({
      data: {
        name: input.name,
        municipalityId: input.municipalityId,
        addressLine: input.addressLine ?? null,
        postalCode: input.postalCode ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        isEmergencyDestination: input.isEmergencyDestination ?? false,
        isTransportDestination: input.isTransportDestination ?? false,
        isActive: input.isActive ?? true,
      },
      include: FACILITY_INCLUDE,
    });
    return serializeFacility(created);
  }

  async update(id: string, dto: UpdateFacilityDto): Promise<Facility> {
    const current = await this.findOne(id);

    // Validate the record as it *will* be, not the patch: "clear the latitude"
    // and "set the longitude" are only coherent together.
    const merged = this.normalize({
      name: dto.name ?? current.name,
      municipalityId: dto.municipalityId ?? current.municipalityId,
      addressLine: dto.addressLine !== undefined ? dto.addressLine : current.addressLine,
      postalCode: dto.postalCode !== undefined ? dto.postalCode : current.postalCode,
      latitude: dto.latitude !== undefined ? dto.latitude : current.latitude,
      longitude: dto.longitude !== undefined ? dto.longitude : current.longitude,
      isEmergencyDestination:
        dto.isEmergencyDestination !== undefined
          ? dto.isEmergencyDestination
          : current.isEmergencyDestination,
      isTransportDestination:
        dto.isTransportDestination !== undefined
          ? dto.isTransportDestination
          : current.isTransportDestination,
      isActive: dto.isActive !== undefined ? dto.isActive : current.isActive,
    });

    const error = validateFacility(merged);
    if (error) throw new BadRequestException(error);

    if (merged.municipalityId !== current.municipalityId) {
      await this.assertMunicipalityExists(merged.municipalityId);
    }
    if (merged.name !== current.name || merged.municipalityId !== current.municipalityId) {
      await this.assertNameFree(merged.name, merged.municipalityId, id);
    }

    const updated = await this.prisma.facility.update({
      where: { id },
      data: {
        name: merged.name,
        municipalityId: merged.municipalityId,
        addressLine: merged.addressLine ?? null,
        postalCode: merged.postalCode ?? null,
        latitude: merged.latitude ?? null,
        longitude: merged.longitude ?? null,
        isEmergencyDestination: merged.isEmergencyDestination ?? false,
        isTransportDestination: merged.isTransportDestination ?? false,
        isActive: merged.isActive ?? true,
      },
      include: FACILITY_INCLUDE,
    });
    return serializeFacility(updated);
  }

  /**
   * Deactivates rather than deletes when any report names this facility.
   *
   * A facility nobody was ever taken to is a typo and can go; one that
   * appears in the record has to stay nameable, so "delete" means "retire"
   * and says so.
   */
  async remove(id: string): Promise<Facility> {
    await this.findOne(id);

    const referenced = await this.prisma.eventReportVictim.count({
      where: { destinationFacilityId: id },
    });

    if (referenced > 0) {
      const retired = await this.prisma.facility.update({
        where: { id },
        data: { isActive: false },
        include: FACILITY_INCLUDE,
      });
      return serializeFacility(retired);
    }

    const deleted = await this.prisma.facility.delete({
      where: { id },
      include: FACILITY_INCLUDE,
    });
    return serializeFacility(deleted);
  }

  private normalize(dto: {
    name: string;
    municipalityId: string;
    addressLine?: string | null;
    postalCode?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    isEmergencyDestination?: boolean;
    isTransportDestination?: boolean;
    isActive?: boolean;
  }) {
    return {
      name: dto.name?.trim() ?? '',
      municipalityId: dto.municipalityId,
      addressLine: dto.addressLine?.trim() || null,
      postalCode: dto.postalCode?.trim() || null,
      latitude: dto.latitude ?? null,
      longitude: dto.longitude ?? null,
      isEmergencyDestination: dto.isEmergencyDestination,
      isTransportDestination: dto.isTransportDestination,
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
    const clash = await this.prisma.facility.findFirst({
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
