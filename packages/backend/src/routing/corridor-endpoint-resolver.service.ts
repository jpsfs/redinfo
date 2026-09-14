import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Coordinates } from './routing.interface';
import { CorridorEndpoint } from './traffic-corridor-key.util';

type PositionRow = {
  latitude: number | null;
  longitude: number | null;
  municipality: { latitude: number; longitude: number } | null;
} | null;

/**
 * A locality's or facility's own coordinate, falling back to its
 * municipality's centroid when it has none of its own — the same
 * "own point, else the area's" rule `Locality`/`Facility`'s doc comments
 * describe (`geography.service.ts`'s `localityPosition` does the same
 * thing for a locality alone; this covers both endpoint kinds one way).
 */
function ownPointOrMunicipalityCentroid(row: PositionRow): Coordinates | null {
  if (!row) return null;
  if (typeof row.latitude === 'number' && typeof row.longitude === 'number') {
    return { latitude: row.latitude, longitude: row.longitude };
  }
  return row.municipality ? { latitude: row.municipality.latitude, longitude: row.municipality.longitude } : null;
}

/** Resolves a `CorridorEndpoint` (#232) to the coordinates `RoutingService` needs — never a patient address, see `routing.module.ts`'s doc comment. */
@Injectable()
export class CorridorEndpointResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(endpoint: CorridorEndpoint): Promise<Coordinates | null> {
    if (endpoint.kind === 'locality') {
      const row = await this.prisma.locality.findUnique({
        where: { id: endpoint.localityId },
        select: { latitude: true, longitude: true, municipality: { select: { latitude: true, longitude: true } } },
      });
      return ownPointOrMunicipalityCentroid(row);
    }

    const row = await this.prisma.facility.findUnique({
      where: { id: endpoint.facilityId },
      select: { latitude: true, longitude: true, municipality: { select: { latitude: true, longitude: true } } },
    });
    return ownPointOrMunicipalityCentroid(row);
  }
}
