#!/usr/bin/env node
/**
 * Gera manual.pdf (A4) a partir de manual.md — para imprimir ou distribuir.
 *
 * Dois passos, cada um com a ferramenta mais leve possível (nada de LaTeX/texlive):
 *   1. pandoc converte o Markdown para um HTML autónomo (imagens embutidas).
 *   2. O Chromium do Playwright já usado por este repo (ver
 *      .claude/skills/run-frontend/driver.mjs) imprime esse HTML para PDF em A4.
 *
 * Uso:
 *   sudo apt-get install -y pandoc   # uma vez só, se `pandoc` não existir
 *   node docs/manual-operador/gerar-pdf.mjs
 */
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../..');
const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve('playwright', { paths: [path.join(repoRoot, 'packages/inem-worker')] }));

const mdFile = path.join(scriptDir, 'manual.md');
const pdfFile = path.join(scriptDir, 'manual.pdf');
const tmp = mkdtempSync(path.join(tmpdir(), 'manual-operador-'));
const htmlFile = path.join(tmp, 'manual.html');

try {
  execFileSync(
    'pandoc',
    [mdFile, '-o', htmlFile, '--standalone', '--embed-resources', '--metadata', 'title=Manual do Operador'],
    // cwd matters: pandoc resolves manual.md's relative image paths (imagens/*)
    // against its own working directory, not against the .md file's location.
    { stdio: 'inherit', cwd: scriptDir },
  );

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`file://${htmlFile}`);
    await page.pdf({
      path: pdfFile,
      format: 'A4',
      margin: { top: '1.5cm', bottom: '1.5cm', left: '1.5cm', right: '1.5cm' },
      printBackground: true,
    });
  } finally {
    await browser.close();
  }

  console.log(`✓ ${path.relative(repoRoot, pdfFile)}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
