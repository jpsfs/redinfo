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
 *
 * The 83 mainland emergency-service points here (polivalente, médico-cirúrgica
 * and básica) are transcribed from DE-SNS Deliberação nº 205/2023 (22/11/2023),
 * the same national network the "Unidade de Saúde" list on
 * https://www.sns.gov.pt/servicos-de-urgencia-sns/ is built from — that page
 * renders its table via Power BI, which isn't scrapable, so the deliberation
 * is the closest fetchable primary source. Madeira and the Azores run their
 * own regional health services and aren't part of this network. The last two
 * entries (Hospital Pediátrico de Coimbra, Hospital Arcebispo João Crisóstomo)
 * predate this list and are kept for continuity though they're not official
 * SU network points.
 */
const STARTING_HOSPITALS: Array<{ name: string; municipality: string }> = [
  // ── Região Norte (29) ──────────────────────────────────────────────────────
  { name: 'CHTMAD — Unidade de Vila Real', municipality: 'Vila Real' },
  { name: 'CHTMAD — Unidade de Chaves', municipality: 'Chaves' },
  { name: 'CHTMAD — Unidade de Lamego', municipality: 'Lamego' },
  { name: 'ULS do Nordeste — Unidade de Bragança', municipality: 'Bragança' },
  { name: 'ULS do Nordeste — Unidade de Mirandela', municipality: 'Mirandela' },
  { name: 'ULS do Nordeste — Unidade de Macedo de Cavaleiros', municipality: 'Macedo de Cavaleiros' },
  { name: 'Centro de Saúde de Mogadouro', municipality: 'Mogadouro' },
  { name: 'Hospital de Braga', municipality: 'Braga' },
  { name: 'ULS do Alto Minho — Unidade de Viana do Castelo', municipality: 'Viana do Castelo' },
  { name: 'ULS do Alto Minho — Unidade de Ponte de Lima', municipality: 'Ponte de Lima' },
  { name: 'Centro de Saúde de Monção', municipality: 'Monção' },
  { name: 'Hospital da Senhora da Oliveira, Guimarães', municipality: 'Guimarães' },
  { name: 'Centro Hospitalar do Médio Ave — Unidade de Vila Nova de Famalicão', municipality: 'Vila Nova de Famalicão' },
  { name: 'Centro Hospitalar do Médio Ave — Unidade de Santo Tirso', municipality: 'Santo Tirso' },
  { name: 'Hospital Santa Maria Maior', municipality: 'Barcelos' },
  { name: 'Centro Hospitalar Universitário de São João', municipality: 'Porto' },
  { name: 'ULS de Matosinhos', municipality: 'Matosinhos' },
  { name: 'Centro Hospitalar Póvoa de Varzim/Vila do Conde', municipality: 'Póvoa de Varzim' },
  { name: 'Centro Hospitalar do Tâmega e Sousa — Unidade do Vale do Sousa', municipality: 'Penafiel' },
  { name: 'Centro Hospitalar do Tâmega e Sousa — Unidade de Amarante', municipality: 'Amarante' },
  { name: 'Centro Hospitalar Universitário de Santo António', municipality: 'Porto' },
  { name: 'Centro Hospitalar de Vila Nova de Gaia/Espinho', municipality: 'Vila Nova de Gaia' },
  { name: 'Centro Hospitalar de Entre Douro e Vouga — Unidade de Santa Maria da Feira', municipality: 'Santa Maria da Feira' },
  { name: 'Centro Hospitalar de Entre Douro e Vouga — Unidade de São João da Madeira', municipality: 'São João da Madeira' },
  { name: 'Centro Hospitalar de Entre Douro e Vouga — Unidade de Oliveira de Azeméis', municipality: 'Oliveira de Azeméis' },
  { name: 'Centro de Saúde de Cinfães', municipality: 'Cinfães' },
  { name: 'Centro de Saúde de Arouca', municipality: 'Arouca' },
  { name: 'Centro de Saúde de Moimenta da Beira', municipality: 'Moimenta da Beira' },
  { name: 'Centro de Saúde de Montalegre', municipality: 'Montalegre' },

  // ── Região Centro (17) ─────────────────────────────────────────────────────
  { name: 'Centro Hospitalar Tondela-Viseu — Unidade de Viseu', municipality: 'Viseu' },
  { name: 'Centro Hospitalar Tondela-Viseu — Unidade de Tondela', municipality: 'Tondela' },
  { name: 'ULS da Guarda', municipality: 'Guarda' },
  { name: 'ULS da Guarda — Unidade de Seia', municipality: 'Seia' },
  { name: 'Centro de Saúde de Vila Nova de Foz Côa', municipality: 'Vila Nova de Foz Côa' },
  { name: 'CHUC — Pólo HUC', municipality: 'Coimbra' },
  { name: 'CHUC — Hospital Geral (Covões)', municipality: 'Coimbra' },
  { name: 'ULS de Castelo Branco', municipality: 'Castelo Branco' },
  { name: 'Centro Hospitalar Cova da Beira', municipality: 'Covilhã' },
  { name: 'Centro Hospitalar do Baixo Vouga — Unidade de Aveiro', municipality: 'Aveiro' },
  { name: 'Centro Hospitalar do Baixo Vouga — Unidade de Águeda', municipality: 'Águeda' },
  { name: 'Hospital Distrital da Figueira da Foz', municipality: 'Figueira da Foz' },
  { name: 'Centro Hospitalar de Leiria — Unidade de Leiria', municipality: 'Leiria' },
  { name: 'Centro Hospitalar de Leiria — Unidade de Pombal', municipality: 'Pombal' },
  { name: 'Centro Hospitalar de Leiria — Unidade de Alcobaça', municipality: 'Alcobaça' },
  { name: 'Centro de Saúde de Arganil', municipality: 'Arganil' },
  { name: 'Centro de Saúde de São Pedro do Sul', municipality: 'São Pedro do Sul' },

  // ── Região Lisboa e Vale do Tejo (19) ──────────────────────────────────────
  { name: 'Centro Hospitalar Universitário Lisboa Norte', municipality: 'Lisboa' },
  { name: 'Hospital de Loures', municipality: 'Loures' },
  { name: 'Centro Hospitalar do Oeste — Unidade de Caldas da Rainha', municipality: 'Caldas da Rainha' },
  { name: 'Centro Hospitalar do Oeste — Unidade de Torres Vedras', municipality: 'Torres Vedras' },
  { name: 'Centro Hospitalar do Oeste — Unidade de Peniche', municipality: 'Peniche' },
  { name: 'Centro Hospitalar Universitário de Lisboa Central', municipality: 'Lisboa' },
  { name: 'Centro Hospitalar do Médio Tejo — Unidade de Abrantes', municipality: 'Abrantes' },
  { name: 'Centro Hospitalar do Médio Tejo — Unidade de Tomar', municipality: 'Tomar' },
  { name: 'Centro Hospitalar do Médio Tejo — Unidade de Torres Novas', municipality: 'Torres Novas' },
  { name: 'Hospital Distrital de Santarém', municipality: 'Santarém' },
  { name: 'Hospital de Vila Franca de Xira', municipality: 'Vila Franca de Xira' },
  { name: 'Centro Hospitalar de Lisboa Ocidental', municipality: 'Lisboa' },
  { name: 'Hospital de Cascais Dr. José de Almeida', municipality: 'Cascais' },
  { name: 'Hospital Prof. Doutor Fernando Fonseca — Unidade de Amadora/Sintra', municipality: 'Amadora' },
  { name: 'Unidade de Saúde de Algueirão-Mem Martins', municipality: 'Sintra' },
  { name: 'Hospital Garcia de Orta', municipality: 'Almada' },
  { name: 'Centro Hospitalar Barreiro-Montijo — Unidade do Barreiro', municipality: 'Barreiro' },
  { name: 'Centro Hospitalar Barreiro-Montijo — Unidade do Montijo', municipality: 'Montijo' },
  { name: 'Centro Hospitalar de Setúbal', municipality: 'Setúbal' },

  // ── Região Alentejo (12) ───────────────────────────────────────────────────
  { name: 'Hospital do Espírito Santo, Évora', municipality: 'Évora' },
  { name: 'ULS do Litoral Alentejano', municipality: 'Santiago do Cacém' },
  { name: 'Centro de Saúde de Alcácer do Sal', municipality: 'Alcácer do Sal' },
  { name: 'Centro de Saúde de Odemira', municipality: 'Odemira' },
  { name: 'ULS do Baixo Alentejo', municipality: 'Beja' },
  { name: 'Centro de Saúde de Castro Verde', municipality: 'Castro Verde' },
  { name: 'Centro de Saúde de Moura', municipality: 'Moura' },
  { name: 'Centro de Saúde de Estremoz', municipality: 'Estremoz' },
  { name: 'Centro de Saúde de Montemor-o-Novo', municipality: 'Montemor-o-Novo' },
  { name: 'ULS do Norte Alentejano — Unidade de Portalegre', municipality: 'Portalegre' },
  { name: 'ULS do Norte Alentejano — Unidade de Elvas', municipality: 'Elvas' },
  { name: 'Centro de Saúde de Ponte de Sor', municipality: 'Ponte de Sor' },

  // ── Região Algarve (6) ─────────────────────────────────────────────────────
  { name: 'Centro Hospitalar Universitário do Algarve — Unidade de Faro', municipality: 'Faro' },
  { name: 'Centro Hospitalar Universitário do Algarve — Unidade de Portimão', municipality: 'Portimão' },
  { name: 'Centro Hospitalar Universitário do Algarve — Unidade de Lagos', municipality: 'Lagos' },
  { name: 'Centro de Saúde de Albufeira', municipality: 'Albufeira' },
  { name: 'Centro de Saúde de Loulé', municipality: 'Loulé' },
  { name: 'Centro de Saúde de Vila Real de Santo António', municipality: 'Vila Real de Santo António' },

  // ── Kept for continuity (not official SU network points) ─────────────────
  { name: 'Hospital Pediátrico de Coimbra', municipality: 'Coimbra' },
  { name: 'Hospital Arcebispo João Crisóstomo', municipality: 'Cantanhede' },
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
