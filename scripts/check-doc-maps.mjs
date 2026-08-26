#!/usr/bin/env node
/**
 * Guards the two lookup indexes in packages/*\/CLAUDE.md against drift from
 * the source files they summarise:
 *
 *   - packages/backend/CLAUDE.md  "Model index by domain" vs prisma/schema.prisma models
 *   - packages/shared/CLAUDE.md   "Section map" table     vs the banner comments in index.ts
 *
 * Those docs exist so a coding agent doesn't have to whole-read a 1000+ line
 * file to find something; if the index falls out of sync with reality it's
 * worse than no index. This script is the mechanical check — everyday upkeep
 * is a checklist step in .claude/skills/redinfo-feature-slice/SKILL.md.
 *
 *   node scripts/check-doc-maps.mjs
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');

let failed = false;
const fail = (msg) => {
  console.error(msg);
  failed = true;
};

// --- backend: Prisma model index -------------------------------------------------

const schema = read('packages/backend/prisma/schema.prisma');
const schemaModels = new Set([...schema.matchAll(/^model (\w+) \{/gm)].map((m) => m[1]));

const backendDoc = read('packages/backend/CLAUDE.md');
// Names in backticks anywhere between "Model index by domain" and the next "##" heading.
const modelSectionMatch = backendDoc.match(/Model index by domain[\s\S]*?(?=\n## |\n$)/);
if (!modelSectionMatch) {
  fail('packages/backend/CLAUDE.md: could not find the "Model index by domain" section.');
} else {
  const docModels = new Set([...modelSectionMatch[0].matchAll(/`(\w+)`/g)].map((m) => m[1]));

  for (const model of schemaModels) {
    if (!docModels.has(model)) {
      fail(`packages/backend/CLAUDE.md: model \`${model}\` exists in schema.prisma but is missing from the model index.`);
    }
  }
  for (const model of docModels) {
    if (!schemaModels.has(model)) {
      fail(`packages/backend/CLAUDE.md: model \`${model}\` is listed in the model index but no longer exists in schema.prisma.`);
    }
  }
}

// --- shared: banner section map --------------------------------------------------

const sharedSrc = read('packages/shared/src/index.ts');
const sharedBanners = [...sharedSrc.matchAll(/^\/\/ ─── (.+?) ─+$/gm)].map((m) => m[1].trim());
// Strip trailing parenthetical refs like "(#180 phase 4)" — the doc summarises, doesn't quote.
const sharedBannerSet = new Set(sharedBanners.map((b) => b.replace(/\s*\(.*?\)\s*$/, '')));

const sharedDoc = read('packages/shared/CLAUDE.md');
const mapSectionMatch = sharedDoc.match(/## Section map[\s\S]*?(?=\n## |\n$)/);
if (!mapSectionMatch) {
  fail('packages/shared/CLAUDE.md: could not find the "## Section map" section.');
} else {
  // Table rows: "| Section name | ... |"
  const docSections = [...mapSectionMatch[0].matchAll(/^\| ([^|]+?) \|/gm)]
    .map((m) => m[1].trim())
    .filter((s) => s !== 'Section'); // header row

  const docSectionSet = new Set(docSections);

  for (const banner of sharedBannerSet) {
    if (!docSectionSet.has(banner)) {
      fail(`packages/shared/CLAUDE.md: banner "${banner}" exists in index.ts but is missing from the Section map.`);
    }
  }
  for (const section of docSectionSet) {
    if (!sharedBannerSet.has(section)) {
      fail(`packages/shared/CLAUDE.md: Section map lists "${section}" but no matching banner exists in index.ts.`);
    }
  }
}

if (failed) {
  console.error('\nDoc-map check failed — see .claude/skills/redinfo-feature-slice/SKILL.md step 6.');
  process.exit(1);
}

console.log('Doc-map check passed.');
process.exit(0);
