import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { foldForSearch } from '@redinfo/shared';

interface MunicipalityFixture {
  ineCode: string;
  name: string;
  district: string;
  latitude: number;
  longitude: number;
  localities: string[];
}

interface LocalityDataset {
  sources: string[];
  municipalityCount: number;
  localityCount: number;
  municipalities: MunicipalityFixture[];
}

/**
 * The hospital list a delegation starts with.
 *
 * Deliberately without coordinates: the municipality centroid is a good enough
 * origin for ordering a handful of hospitals by distance, and inventing
 * lat/lng pairs to look precise would be worse than admitting the
 * approximation. A coordinator fills them in when the ordering ever looks
 * wrong.
 *
 * Matched to municipalities by name, and skipped with a warning when the
 * municipality is not found, so a typo here can never fail a deployment.
 */
const STARTING_HOSPITALS: Array<{ name: string; municipality: string }> = [
  { name: 'CHUC — Hospital Geral (Covões)', municipality: 'Coimbra' },
  { name: 'CHUC — Pólo HUC', municipality: 'Coimbra' },
  { name: 'Hospital Pediátrico de Coimbra', municipality: 'Coimbra' },
  { name: 'Hospital Arcebispo João Crisóstomo', municipality: 'Cantanhede' },
  { name: 'Hospital Distrital da Figueira da Foz', municipality: 'Figueira da Foz' },
  { name: 'Centro Hospitalar de Leiria', municipality: 'Leiria' },
  { name: 'Centro Hospitalar do Baixo Vouga', municipality: 'Aveiro' },
];

async function loadDataset(): Promise<LocalityDataset> {
  const path = join(__dirname, 'data', 'pt-localities.json');
  return JSON.parse(await readFile(path, 'utf8')) as LocalityDataset;
}

/**
 * Seeds Portugal's administrative map and a starting hospital list.
 *
 * Idempotent by design — the INE code identifies a municipality and
 * `(municipalityId, name)` a locality, so re-running updates in place rather
 * than duplicating. That matters because this runs on every deployment: a new
 * dataset (a municipality renamed, a freguesia merged) should land by
 * re-seeding, not by a hand-written migration.
 *
 * Nothing is ever deleted here. A locality that leaves the dataset may still be
 * named by a filed report, and the report is the record.
 */
export async function seedGeography(prisma: PrismaClient): Promise<void> {
  const dataset = await loadDataset();

  let municipalitiesWritten = 0;
  let localitiesWritten = 0;

  for (const fixture of dataset.municipalities) {
    const municipality = await prisma.municipality.upsert({
      where: { ineCode: fixture.ineCode },
      create: {
        ineCode: fixture.ineCode,
        name: fixture.name,
        district: fixture.district,
        latitude: fixture.latitude,
        longitude: fixture.longitude,
      },
      update: {
        name: fixture.name,
        district: fixture.district,
        latitude: fixture.latitude,
        longitude: fixture.longitude,
      },
    });
    municipalitiesWritten += 1;

    // `skipDuplicates` rather than a per-row upsert: the only mutable column is
    // `searchName`, which is derived from `name` — the unique key — so a row
    // that already exists cannot be stale.
    const created = await prisma.locality.createMany({
      data: fixture.localities.map((name) => ({
        name,
        searchName: foldForSearch(name),
        municipalityId: municipality.id,
      })),
      skipDuplicates: true,
    });
    localitiesWritten += created.count;
  }

  console.log(
    `🗺  Geography: ${municipalitiesWritten} municipalities, ${localitiesWritten} new localities ` +
      `(dataset holds ${dataset.localityCount})`,
  );

  await seedHospitals(prisma);
}

async function seedHospitals(prisma: PrismaClient): Promise<void> {
  let created = 0;
  let skipped = 0;

  for (const fixture of STARTING_HOSPITALS) {
    const municipality = await prisma.municipality.findFirst({
      where: { name: fixture.municipality },
    });
    if (!municipality) {
      console.warn(
        `⚠️  Hospital "${fixture.name}": no municipality called "${fixture.municipality}" — skipped`,
      );
      skipped += 1;
      continue;
    }

    const existing = await prisma.hospital.findFirst({
      where: { name: fixture.name, municipalityId: municipality.id },
    });
    // Left alone if it is already there: a coordinator may have added
    // coordinates or deactivated it, and the seed has no business undoing that.
    if (existing) continue;

    await prisma.hospital.create({
      data: { name: fixture.name, municipalityId: municipality.id },
    });
    created += 1;
  }

  console.log(`🏥 Hospitals: ${created} added${skipped ? `, ${skipped} skipped` : ''}`);
}
