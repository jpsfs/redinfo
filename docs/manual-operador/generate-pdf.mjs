#!/usr/bin/env node
/**
 * Generates manual.pdf (A4) from manual.md — for printing or distribution.
 *
 * Two steps, each with the lightest tool that does the job (no LaTeX/texlive):
 *   1. pandoc converts the Markdown into a standalone HTML file (images embedded).
 *   2. The Playwright Chromium already used elsewhere in this repo (see
 *      .claude/skills/run-frontend/driver.mjs) prints that HTML to an A4 PDF.
 *
 * Usage:
 *   sudo apt-get install -y pandoc   # once only, if `pandoc` isn't installed
 *   node docs/manual-operador/generate-pdf.mjs
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
    // No `--metadata title=...`: pandoc's standalone HTML template renders a
    // second, redundant "Manual do Operador" heading at the top of the body
    // whenever a title is set — the cover page below already has its own.
    [mdFile, '-o', htmlFile, '--standalone', '--embed-resources'],
    // cwd matters: pandoc resolves manual.md's relative image paths (images/*)
    // against its own working directory, not against the .md file's location.
    { stdio: 'inherit', cwd: scriptDir },
  );

  // Chromium's header/footer templates are one fixed snippet of HTML stamped
  // on every page — including the cover — since there is no per-page script
  // to tell a running head apart from a body page. Classes `pageNumber` and
  // `totalPages` are the two placeholders Chromium fills in itself; every
  // other class/style here is just plain CSS.
  const headerTemplate = `
    <div style="font-size:8px; width:100%; padding:0 1.5cm; margin-top:0.6cm;
                display:flex; align-items:center; gap:6px; color:#666;
                font-family:Helvetica,Arial,sans-serif;
                border-bottom:1px solid #ED1B24; padding-bottom:4px;">
      <span style="color:#ED1B24; font-weight:bold;">Manual do Operador</span>
      <span>— CVP Portal · Cruz Vermelha Portuguesa</span>
    </div>`;
  const footerTemplate = `
    <div style="font-size:8px; width:100%; padding:0 1.5cm; margin-bottom:0.5cm;
                display:flex; justify-content:space-between; color:#666;
                font-family:Helvetica,Arial,sans-serif;
                border-top:1px solid #ddd; padding-top:4px;">
      <span>Cruz Vermelha Portuguesa — Delegação de Campo</span>
      <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
    </div>`;

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`file://${htmlFile}`);
    await page.pdf({
      path: pdfFile,
      format: 'A4',
      // Taller top/bottom margins than a header/footer-less print: the
      // template above renders inside this margin band, so it has to be
      // roomy enough that body text never collides with either bar.
      margin: { top: '2.1cm', bottom: '1.8cm', left: '1.5cm', right: '1.5cm' },
      displayHeaderFooter: true,
      headerTemplate,
      footerTemplate,
      printBackground: true,
    });
  } finally {
    await browser.close();
  }

  console.log(`✓ ${path.relative(repoRoot, pdfFile)}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
