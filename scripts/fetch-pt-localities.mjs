#!/usr/bin/env node
/**
 * Regenerates `packages/backend/prisma/data/pt-localities.json` — every
 * municipality and freguesia in Portugal, with a coordinate per municipality.
 *
 * Run it by hand when the administrative map changes (municipality merges are
 * rare; the last freguesia reorganisation was 2013). The generated file is
 * committed, so neither the build, the tests, nor `prisma db seed` ever needs
 * network access.
 *
 *   node scripts/fetch-pt-localities.mjs
 *
 * Two sources, because neither alone has both halves:
 *
 *   • geoapi.pt — the authoritative list of municipalities (with their INE
 *     `dtmn` code) and the freguesias inside each one. No coordinates.
 *   • Wikidata  — a coordinate for each municipality. No INE code exposed on
 *     the items, so municipalities are joined on an accent- and
 *     punctuation-folded name; the script fails loudly if any municipality
 *     comes out without a coordinate.
 *
 * Coordinates are held per *municipality*, not per freguesia: they exist only
 * to order hospitals by distance, and hospitals are tens of kilometres apart
 * while a municipality is a handful across. One coordinate per municipality is
 * accurate enough for that ordering and keeps 3,000+ freguesias from carrying
 * a number nothing reads.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../packages/backend/prisma/data/pt-localities.json');

const GEOAPI_FREGUESIAS = 'https://json.geoapi.pt/municipios/freguesias';
const WIKIDATA_SPARQL = 'https://query.wikidata.org/sparql';
const USER_AGENT = 'redinfo-locality-import/1.0 (Cruz Vermelha Portuguesa, Delegação de Campo)';

/**
 * First two digits of an INE `dtmn` code name the district (mainland) or the
 * island (Azores and Madeira). Fixed by INE and unchanged since 1976, so this
 * is a constant rather than a third network source.
 */
const DISTRICT_BY_CODE = {
  '01': 'Aveiro',
  '02': 'Beja',
  '03': 'Braga',
  '04': 'Bragança',
  '05': 'Castelo Branco',
  '06': 'Coimbra',
  '07': 'Évora',
  '08': 'Faro',
  '09': 'Guarda',
  10: 'Leiria',
  11: 'Lisboa',
  12: 'Portalegre',
  13: 'Porto',
  14: 'Santarém',
  15: 'Setúbal',
  16: 'Viana do Castelo',
  17: 'Vila Real',
  18: 'Viseu',
  31: 'Ilha da Madeira',
  32: 'Ilha de Porto Santo',
  41: 'Ilha de Santa Maria',
  42: 'Ilha de São Miguel',
  43: 'Ilha Terceira',
  44: 'Ilha Graciosa',
  45: 'Ilha de São Jorge',
  46: 'Ilha do Pico',
  47: 'Ilha do Faial',
  48: 'Ilha das Flores',
  49: 'Ilha do Corvo',
};

/**
 * Municipalities Wikidata does not answer for under the name geoapi.pt uses —
 * all three island councils whose Wikidata label carries a disambiguator.
 * Coordinates are the municipal seat, to 4 decimal places (~10 m), which is
 * far finer than the ordering they feed.
 */
const COORDINATE_OVERRIDES = {
  4501: { latitude: 38.5975, longitude: -28.0075 }, // Calheta (São Jorge)
  4201: { latitude: 37.7456, longitude: -25.5822 }, // Lagoa (São Miguel)
  4901: { latitude: 39.6994, longitude: -31.1122 }, // Corvo
};

/** Accent-, case- and punctuation-folded, for joining two sources by name. */
const fold = (value) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

async function fetchJson(url, init) {
  const response = await fetch(url, {
    ...init,
    headers: { 'User-Agent': USER_AGENT, ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    throw new Error(`${url} → HTTP ${response.status} ${response.statusText}`);
  }
  return response.json();
}

const MUNICIPALITY_COORDS_QUERY = `
SELECT ?mLabel ?lat ?lon WHERE {
  ?m wdt:P31 wd:Q13217644 .
  ?m p:P625/psv:P625 ?c .
  ?c wikibase:geoLatitude ?lat ; wikibase:geoLongitude ?lon .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "pt,en". }
}`;

async function fetchMunicipalityCoordinates() {
  const url = `${WIKIDATA_SPARQL}?query=${encodeURIComponent(MUNICIPALITY_COORDS_QUERY)}`;
  const body = await fetchJson(url, { headers: { Accept: 'application/sparql-results+json' } });

  const byName = new Map();
  for (const row of body.results.bindings) {
    const key = fold(row.mLabel.value);
    // First answer wins: duplicates are historical or same-name items, and a
    // municipality centroid does not move enough between them to matter.
    if (byName.has(key)) continue;
    byName.set(key, {
      latitude: Number(row.lat.value),
      longitude: Number(row.lon.value),
    });
  }
  return byName;
}

/**
 * geoapi.pt lowercases the particles inside a municipality name
 * ("Alfândega da fé", "Albergaria-a-velha"). Title-case each word except the
 * Portuguese particles, which stay lowercase — how the names are actually
 * written.
 */
const PARTICLES = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'as', 'os', 'em']);

function titleCasePlaceName(name) {
  return name
    .split(/(\s+|-)/)
    .map((part, index) => {
      if (/^(\s+|-)$/.test(part)) return part;
      const lower = part.toLocaleLowerCase('pt-PT');
      if (index > 0 && PARTICLES.has(lower)) return lower;
      return lower.charAt(0).toLocaleUpperCase('pt-PT') + lower.slice(1);
    })
    .join('');
}

async function main() {
  process.stdout.write('Fetching municipalities and freguesias from geoapi.pt… ');
  const municipalities = await fetchJson(GEOAPI_FREGUESIAS);
  process.stdout.write(`${municipalities.length} municipalities\n`);

  process.stdout.write('Fetching municipality coordinates from Wikidata… ');
  const coordinates = await fetchMunicipalityCoordinates();
  process.stdout.write(`${coordinates.size} coordinates\n`);

  const missing = [];
  const rows = municipalities
    .map((municipality) => {
      const ineCode = String(municipality.dtmn ?? municipality.codigoine);
      const district = DISTRICT_BY_CODE[ineCode.slice(0, 2)];
      if (!district) {
        throw new Error(`No district for INE code ${ineCode} (${municipality.nome})`);
      }

      const coordinate =
        COORDINATE_OVERRIDES[ineCode] ?? coordinates.get(fold(municipality.nome));
      if (!coordinate) missing.push(`${municipality.nome} (${ineCode})`);

      return {
        ineCode,
        name: titleCasePlaceName(municipality.nome),
        district,
        latitude: coordinate?.latitude ?? null,
        longitude: coordinate?.longitude ?? null,
        // Sorted so a regenerated file diffs cleanly against the committed one.
        localities: [...new Set(municipality.freguesias)]
          .map(titleCasePlaceName)
          .sort((a, b) => a.localeCompare(b, 'pt-PT')),
      };
    })
    .sort((a, b) => a.ineCode.localeCompare(b.ineCode));

  if (missing.length > 0) {
    throw new Error(
      `No coordinate for ${missing.length} municipalities: ${missing.join(', ')}\n` +
        'Add them to COORDINATE_OVERRIDES rather than shipping a municipality ' +
        'that can never order hospitals by distance.',
    );
  }

  const localityCount = rows.reduce((total, row) => total + row.localities.length, 0);

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(
    OUT,
    `${JSON.stringify(
      {
        // No generatedAt: a timestamp would churn the diff on every run and
        // tells us nothing the git history does not already record.
        sources: [GEOAPI_FREGUESIAS, WIKIDATA_SPARQL],
        municipalityCount: rows.length,
        localityCount,
        municipalities: rows,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  process.stdout.write(
    `Wrote ${OUT}\n  ${rows.length} municipalities, ${localityCount} localities\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
