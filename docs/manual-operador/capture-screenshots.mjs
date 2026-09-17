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
// Desktop pass (section 2's "no computador" screenshots): wide enough that
// AppLayout renders its permanent sidebar rail instead of the mobile
// hamburger drawer (see packages/frontend/src/layout/AppLayout.tsx, `sm`-down
// breakpoint) — a plain laptop resolution, not a phone one.
const DESKTOP_WIDTH = 1440;
const DESKTOP_HEIGHT = 900;

mkdirSync(OUT_DIR, { recursive: true });

// images/ is git-ignored (see .gitignore) — chapters and logo always come from here,
// never from the repository. The manual's cover page reuses the same logo the
// frontend already serves, and the "install as an app" section reuses the
// real PWA home-screen icon (public/manifest.webmanifest) rather than a
// screenshot, since the OS install prompt itself isn't something a headless
// browser renders.
copyFileSync(
  path.join(repoRoot, 'packages/frontend/public/logo-delegacao.jpg'),
  path.join(OUT_DIR, 'logo-delegacao.jpg'),
);
copyFileSync(
  path.join(repoRoot, 'packages/frontend/public/icons/icon-192.png'),
  path.join(OUT_DIR, 'app-icon.png'),
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

    // Walks the run forward one stamp at a time, exactly as a crew would tap
    // through it — each stamp both records the moment and advances the run
    // to its next screen (see `LIVE_RUN_STATE_RULES`, shared), so a screenshot
    // after each tap is the next screen in the walk. Fields are left blank
    // throughout, same as every other form screenshot in this manual: these
    // illustrate the screen's shape, not a filled example.
    await page.getByRole('button', { name: 'A CAMINHO' }).click();
    await page.waitForTimeout(800);
    await shot(page, '12-live-enroute');

    await page.getByRole('button', { name: 'CHEGUEI AO LOCAL' }).click();
    await page.waitForTimeout(800);
    await shot(page, '13-live-scene');

    // Assessment is a branch off "on scene", reached and left deliberately —
    // it does not sit on the walk above (see `LIVE_RUN_WALK`, shared).
    await page.getByRole('button', { name: 'Avaliação' }).click();
    await page.waitForTimeout(800);
    await shot(page, '14-live-assessment');
    await page.getByRole('button', { name: 'CONCLUIR AVALIAÇÃO' }).first().click();
    await page.waitForTimeout(600);

    await page.getByRole('button', { name: 'SAÍDA DO LOCAL' }).click();
    await page.waitForTimeout(800);
    await shot(page, '15-live-transport');

    await page.getByRole('button', { name: 'CHEGADA AO HOSPITAL' }).click();
    await page.waitForTimeout(800);
    await shot(page, '16-live-closing');

    await page.getByRole('button', { name: 'PASSAGEM AO HOSPITAL' }).click();
    await page.waitForTimeout(800);
    await shot(page, '17-live-handover');
    await page.getByRole('button', { name: 'Fechar' }).click();
    await page.waitForTimeout(400);

    await page.getByRole('button', { name: 'Registar material' }).click();
    await page.waitForTimeout(600);
    await shot(page, '18-live-materials');

    console.log('\nScreenshots done.');

    // ── Event reports, again on a desktop viewport ──────────────────────
    // Section 2 of the manual shows the same "create a report" flow on
    // mobile and on desktop, since AppLayout swaps the mobile hamburger
    // drawer for a permanent sidebar rail above the `sm` breakpoint — a
    // fresh context/login rather than just resizing the existing page, so
    // the sidebar is actually rendered (it depends on viewport at mount).
    const desktopContext = await browser.newContext({
      viewport: { width: DESKTOP_WIDTH, height: DESKTOP_HEIGHT },
      locale: 'pt-PT',
    });
    const desktopPage = await desktopContext.newPage();
    desktopPage.on('pageerror', (err) => console.error('  pageerror:', err.message));

    await desktopPage.goto(`${BASE_URL}/#/login`, { waitUntil: 'networkidle' });
    await desktopPage.locator('input[name="username"], input[type="email"], #username').first().fill(USERNAME);
    await desktopPage.locator('input[name="password"], input[type="password"]').first().fill(PASSWORD);
    await desktopPage.locator('button[type="submit"]').first().click();
    await desktopPage.waitForTimeout(2000);

    await desktopPage.goto(`${BASE_URL}/#/my-reports`, { waitUntil: 'networkidle' });
    await shot(desktopPage, '19-reports-list-desktop');

    await desktopPage.getByText('Novo relatório', { exact: true }).click();
    await desktopPage.waitForTimeout(1000);
    await shot(desktopPage, '20-reports-type-desktop');

    await desktopPage.locator('[data-testid="choose-EMERGENCY"]').click();
    await desktopPage.waitForTimeout(1000);
    await shot(desktopPage, '21-reports-form-desktop');

    await desktopContext.close();

    console.log('Desktop screenshots done.');
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
