#!/usr/bin/env node
/**
 * Generates the screenshots used in docs/manual-operador/manual.md.
 *
 * Runs a headless Chromium (same technique as .claude/skills/run-frontend/driver.mjs),
 * logged in as a plain EMERGENCY_OPERATIONAL account (Inês Marques, dev seed data in
 * packages/backend/prisma/seed-dev.ts) — so the images show exactly what an emergency
 * operator sees, with no coordination features.
 *
 * Usage:
 *   sudo -n docker compose up -d --build
 *   node docs/manual-operador/capture-screenshots.mjs
 *
 * Images are written to docs/manual-operador/images/.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, copyFileSync } from 'node:fs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../..');
const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve('playwright', { paths: [path.join(repoRoot, 'packages/inem-worker')] }));

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';
const USERNAME = process.env.REDINFO_USERNAME || 'ines.marques@redcross.local';
const PASSWORD = process.env.REDINFO_PASSWORD || 'Volunteer123!';
const OUT_DIR = path.join(scriptDir, 'images');
const WIDTH = 390;
const HEIGHT = 844;

mkdirSync(OUT_DIR, { recursive: true });

// images/ is git-ignored (see .gitignore) — chapters and logo always come from here,
// never from the repository. The manual's cover page reuses the same logo the
// frontend already serves.
copyFileSync(
  path.join(repoRoot, 'packages/frontend/public/logo-delegacao.jpg'),
  path.join(OUT_DIR, 'logo-delegacao.jpg'),
);

async function shot(page, name) {
  const outfile = path.join(OUT_DIR, `${name}.png`);
  await page.waitForTimeout(500);
  // Viewport only, not fullPage: several screens have a position:fixed bottom
  // bar (Guardar/Seguinte/stamp button) that Playwright's fullPage stitching
  // duplicates floating mid-page once content scrolls past one screen. A
  // plain viewport shot is also just what the operator actually sees without
  // scrolling, which suits a step-by-step manual better anyway.
  await page.screenshot({ path: outfile, fullPage: false });
  console.log(`✓ ${name}.png`);
}

async function main() {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  // Headless Chromium's default locale is en-US, and the CVP Portal detects its
  // language from the browser (i18nProvider.ts, detectLocale) — without this the
  // screenshots would come out in English.
  const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, locale: 'pt-PT' });
  const page = await context.newPage();
  page.on('pageerror', (err) => console.error('  pageerror:', err.message));

  try {
    // ── Login ────────────────────────────────────────────────────────────
    await page.goto(`${BASE_URL}/#/login`, { waitUntil: 'networkidle' });
    await shot(page, '00-login');
    await page.locator('input[name="username"], input[type="email"], #username').first().fill(USERNAME);
    await page.locator('input[name="password"], input[type="password"]').first().fill(PASSWORD);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(2000);

    // ── Home ─────────────────────────────────────────────────────────────
    await page.goto(`${BASE_URL}/#/`, { waitUntil: 'networkidle' });
    await shot(page, '01-home');

    // ── Event reports ────────────────────────────────────────────────────
    await page.goto(`${BASE_URL}/#/my-reports`, { waitUntil: 'networkidle' });
    await shot(page, '02-reports-list');

    await page.getByText('Novo relatório', { exact: true }).click();
    await page.waitForTimeout(1000);
    await shot(page, '03-reports-type');

    await page.locator('[data-testid="choose-EMERGENCY"]').click();
    await page.waitForTimeout(1000);
    await shot(page, '04-reports-form');

    // ── Volunteer hours ──────────────────────────────────────────────────
    await page.goto(`${BASE_URL}/#/my-hours`, { waitUntil: 'networkidle' });
    await shot(page, '05-hours-list');

    await page.getByRole('button', { name: 'Registar horas' }).click();
    await page.waitForTimeout(600);
    await shot(page, '06-hours-form');
    // Closes the dialog without saving — this is only for the screenshot.
    await page.keyboard.press('Escape');

    // ── Availability ─────────────────────────────────────────────────────
    await page.goto(`${BASE_URL}/#/my-availability`, { waitUntil: 'networkidle' });
    await shot(page, '07-availability');

    // ── Schedule (my shifts) ─────────────────────────────────────────────
    await page.goto(`${BASE_URL}/#/my-duties`, { waitUntil: 'networkidle' });
    await shot(page, '08-schedule');

    // ── Statistics ───────────────────────────────────────────────────────
    await page.goto(`${BASE_URL}/#/statistics`, { waitUntil: 'networkidle' });
    await shot(page, '09-statistics');

    // ── Live mode ────────────────────────────────────────────────────────
    await page.goto(`${BASE_URL}/#/live`, { waitUntil: 'networkidle' });
    await shot(page, '10-live-start');

    await page.getByRole('button', { name: 'Nova ocorrência' }).click();
    await page.waitForTimeout(1200);
    await shot(page, '11-live-activation');

    console.log('\nScreenshots done.');
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
