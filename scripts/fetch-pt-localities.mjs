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
 *   • Wikidata  — a coordinate for each municipality, *and* — separately — a
 *     coordinate for most individual freguesias. No INE code exposed on
 *     either, so both are joined on an accent- and punctuation-folded name;
 *     the script fails loudly if any municipality comes out without a
 *     coordinate (there is no fallback for those).
 *
 * A freguesia gets its own coordinate when Wikidata has one (~98% of them
 * do); the rest carry `latitude`/`longitude: null` and fall back to their
 * municipality's centroid at read time — the same "own point, else the
 * area's" pattern `Hospital.latitude/longitude` already uses. A municipality
 * can be tens of kilometres across, so that centroid was never a good enough
 * stand-in for "where in it a specific freguesia actually is" — it only ever
 * worked for ordering *other* municipalities' hospitals from many kilometres
 * away, not for telling two freguesias of the same município apart.
 *
 * Wikidata labels freguesias two ways that don't match geoapi.pt's plain
 * names, so both are tried when joining: a disambiguated freguesia is
 * "Freguesia de <nome>" (stripped before matching), and a post-2013 merged
 * parish is labelled without its "União das Freguesias de " prefix (also
 * tried stripped, on our side).
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

/** `Q1131296` = "freguesia of Portugal"; `P131` ("located in the administrative territorial entity") is its município. */
const LOCALITY_COORDS_QUERY = `
SELECT ?fLabel ?lat ?lon ?muniLabel WHERE {
  ?f wdt:P31 wd:Q1131296 .
  ?f wdt:P625 ?coord .
  BIND(geof:latitude(?coord) AS ?lat)
  BIND(geof:longitude(?coord) AS ?lon)
  OPTIONAL { ?f wdt:P131 ?muni . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "pt,en". }
}`;

/** Wikidata's own disambiguator for a freguesia whose bare name collides with something else notable. */
const FREGUESIA_PREFIX = /^freguesia (de|do|da) /i;
/** geoapi.pt's prefix for a post-2013 merged parish; Wikidata labels the same place without it. */
const UNIAO_PREFIX = /^uni(a|ã)o (das|de) freguesias (de|do|da) /i;

/**
 * A coordinate per freguesia, keyed by `${foldedName}|${foldedMunicipality}`
 * — a município-scoped key because freguesia names are not unique across the
 * country (e.g. several councils each have their own "Santa Maria"), so the
 * name alone cannot be the key.
 */
async function fetchLocalityCoordinates() {
  const url = `${WIKIDATA_SPARQL}?query=${encodeURIComponent(LOCALITY_COORDS_QUERY)}`;
  const body = await fetchJson(url, { headers: { Accept: 'application/sparql-results+json' } });

  const byKey = new Map();
  for (const row of body.results.bindings) {
    const name = row.fLabel?.value;
    const municipality = row.muniLabel?.value;
    if (!name || !municipality || !row.lat || !row.lon) continue;
    const key = `${fold(name.replace(FREGUESIA_PREFIX, ''))}|${fold(municipality)}`;
    // First answer wins: some freguesias carry more than one coordinate
    // statement (an imported one alongside a hand-set one) and neither is
    // wrong enough, at freguesia scale, to prefer one over the other.
    if (byKey.has(key)) continue;
    byKey.set(key, { latitude: Number(row.lat.value), longitude: Number(row.lon.value) });
  }
  return byKey;
}

/** Every folded key a freguesia's own name could plausibly match under in `fetchLocalityCoordinates`'s map. */
function localityCoordinateKeys(name, municipalityName) {
  const municipalityKey = fold(municipalityName);
  return [...new Set([name, name.replace(UNIAO_PREFIX, '')])].map(
    (candidate) => `${fold(candidate)}|${municipalityKey}`,
  );
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
  const municipalityCoordinates = await fetchMunicipalityCoordinates();
  process.stdout.write(`${municipalityCoordinates.size} coordinates\n`);

  process.stdout.write('Fetching freguesia coordinates from Wikidata… ');
  const localityCoordinates = await fetchLocalityCoordinates();
  process.stdout.write(`${localityCoordinates.size} coordinates\n`);

  const missing = [];
  let localitiesWithOwnCoordinate = 0;
  const rows = municipalities
    .map((municipality) => {
      const ineCode = String(municipality.dtmn ?? municipality.codigoine);
      const district = DISTRICT_BY_CODE[ineCode.slice(0, 2)];
      if (!district) {
        throw new Error(`No district for INE code ${ineCode} (${municipality.nome})`);
      }

      const municipalityName = titleCasePlaceName(municipality.nome);
      const coordinate =
        COORDINATE_OVERRIDES[ineCode] ?? municipalityCoordinates.get(fold(municipality.nome));
      if (!coordinate) missing.push(`${municipality.nome} (${ineCode})`);

      // Sorted so a regenerated file diffs cleanly against the committed one.
      const localities = [...new Set(municipality.freguesias)]
        .map(titleCasePlaceName)
        .sort((a, b) => a.localeCompare(b, 'pt-PT'))
        .map((name) => {
          const own = localityCoordinateKeys(name, municipalityName)
            .map((key) => localityCoordinates.get(key))
            .find(Boolean);
          if (own) localitiesWithOwnCoordinate += 1;
          return { name, latitude: own?.latitude ?? null, longitude: own?.longitude ?? null };
        });

      return {
        ineCode,
        name: municipalityName,
        district,
        latitude: coordinate?.latitude ?? null,
        longitude: coordinate?.longitude ?? null,
        localities,
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
    `Wrote ${OUT}\n  ${rows.length} municipalities, ${localityCount} localities ` +
      `(${localitiesWithOwnCoordinate} with their own coordinate, ` +
      `${localityCount - localitiesWithOwnCoordinate} falling back to their município's)\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
