#!/usr/bin/env node
/**
 * Gera as capturas de ecrã usadas em docs/manual-operador/manual.md.
 *
 * Corre num Chromium headless (mesma técnica de .claude/skills/run-frontend/driver.mjs),
 * autenticado com uma conta puramente EMERGENCY_OPERATIONAL (Inês Marques, dados de
 * desenvolvimento em packages/backend/prisma/seed-dev.ts) — para que as imagens mostrem
 * exatamente o que um operador de emergência vê, sem nada de coordenação.
 *
 * Uso:
 *   sudo -n docker compose up -d --build
 *   node docs/manual-operador/capturar-ecras.mjs
 *
 * As imagens saem para docs/manual-operador/imagens/.
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
const OUT_DIR = path.join(scriptDir, 'imagens');
const WIDTH = 390;
const HEIGHT = 844;

mkdirSync(OUT_DIR, { recursive: true });

// imagens/ is git-ignored (see .gitignore) — capítulos e logo saem sempre daqui, nunca
// do repositório. A capa do manual usa o mesmo logo já servido pelo frontend.
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
  // O locale por omissão do Chromium headless é en-US, e o CVP Portal deteta o
  // idioma pelo browser (i18nProvider.ts, detectLocale) — sem isto as capturas
  // saíam em inglês.
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

    // ── Início ───────────────────────────────────────────────────────────
    await page.goto(`${BASE_URL}/#/`, { waitUntil: 'networkidle' });
    await shot(page, '01-inicio');

    // ── Relatórios de evento ─────────────────────────────────────────────
    await page.goto(`${BASE_URL}/#/my-reports`, { waitUntil: 'networkidle' });
    await shot(page, '02-relatorios-lista');

    await page.getByText('Novo relatório', { exact: true }).click();
    await page.waitForTimeout(1000);
    await shot(page, '03-relatorios-tipo');

    await page.locator('[data-testid="choose-EMERGENCY"]').click();
    await page.waitForTimeout(1000);
    await shot(page, '04-relatorios-formulario');

    // ── Horas de voluntariado ────────────────────────────────────────────
    await page.goto(`${BASE_URL}/#/my-hours`, { waitUntil: 'networkidle' });
    await shot(page, '05-horas-lista');

    await page.getByRole('button', { name: 'Registar horas' }).click();
    await page.waitForTimeout(600);
    await shot(page, '06-horas-formulario');
    // Fecha o diálogo sem gravar — é só para a captura de ecrã.
    await page.keyboard.press('Escape');

    // ── Disponibilidade ──────────────────────────────────────────────────
    await page.goto(`${BASE_URL}/#/my-availability`, { waitUntil: 'networkidle' });
    await shot(page, '07-disponibilidade');

    // ── Escala (os meus turnos) ──────────────────────────────────────────
    await page.goto(`${BASE_URL}/#/my-duties`, { waitUntil: 'networkidle' });
    await shot(page, '08-escala');

    // ── Estatísticas ─────────────────────────────────────────────────────
    await page.goto(`${BASE_URL}/#/statistics`, { waitUntil: 'networkidle' });
    await shot(page, '09-estatisticas');

    // ── Modo live ────────────────────────────────────────────────────────
    await page.goto(`${BASE_URL}/#/live`, { waitUntil: 'networkidle' });
    await shot(page, '10-live-entrada');

    await page.getByRole('button', { name: 'Nova ocorrência' }).click();
    await page.waitForTimeout(1200);
    await shot(page, '11-live-ativacao');

    console.log('\nCapturas concluídas.');
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
