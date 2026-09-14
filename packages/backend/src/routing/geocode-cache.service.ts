import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { foldForSearch } from '@redinfo/shared';
import { PrismaService } from '../prisma/prisma.service';
import { Coordinates } from './routing.interface';

/**
 * The `GeocodedAddress` table (#231) — each address is geocoded once and
 * cached forever, there is no volume argument for doing otherwise. The cache
 * key folds the address through shared's `foldForSearch` (the same folding
 * `geography.service.ts` uses for locality search) before hashing, so two
 * spellings of the same street share a row.
 */
@Injectable()
export class GeocodeCacheService {
  constructor(private readonly prisma: PrismaService) {}

  async get(address: string): Promise<Coordinates | null> {
    const row = await this.prisma.geocodedAddress.findUnique({
      where: { addressHash: hashAddress(address) },
      select: { latitude: true, longitude: true },
    });
    return row ? { latitude: row.latitude, longitude: row.longitude } : null;
  }

  /**
   * Never call this with a miss — a transient Nominatim failure should stay
   * retryable, not get baked into the cache as a permanent "no result".
   */
  async put(address: string, coordinates: Coordinates): Promise<void> {
    const addressHash = hashAddress(address);
    await this.prisma.geocodedAddress.upsert({
      where: { addressHash },
      create: {
        addressHash,
        rawAddress: address,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
      },
      // A repeat geocode of the same address should never happen (the cache
      // is checked first), but an upsert keeps a rare race harmless rather
      // than a unique-constraint 500.
      update: {
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
      },
    });
  }
}

function hashAddress(address: string): string {
  return createHash('sha256').update(foldForSearch(address)).digest('hex');
}
