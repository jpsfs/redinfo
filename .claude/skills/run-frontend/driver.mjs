#!/usr/bin/env node
/**
 * Drives the redinfo frontend (packages/frontend, served via `docker
 * compose` at http://localhost:5173) in a real headless Chromium: logs in,
 * navigates to a route, and either screenshots it or checks it for
 * horizontal overflow at a given viewport.
 *
 * Why this exists: a screenshot alone can look fine while the page is
 * secretly laid out wider than the viewport (the browser just scales the
 * image down in preview). The `overflow` command catches that class of bug
 * by comparing `window.innerWidth` to `document.documentElement.scrollWidth`
 * — see SKILL.md's Gotchas for the real bug this caught (#164 follow-up,
 * volunteer-hours-review's filter chips).
 *
 * Usage:
 *   node driver.mjs shot     <route> <outfile.png> [--width N] [--height N]
 *   node driver.mjs overflow <route>               [--width N] [--height N]
 *
 * <route> is a react-admin hash path, e.g. "/volunteer-hours/review" or "/"
 * (becomes http://localhost:5173/#/volunteer-hours/review).
 *
 * Env overrides: BASE_URL (default http://localhost:5173),
 * REDINFO_USERNAME / REDINFO_PASSWORD (default the seeded dev admin).
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// `playwright` isn't a frontend/root dependency — it's pinned at the
// workspace root only via packages/inem-worker's package.json (which uses
// it for real, to drive INEM's login flow). Resolving it explicitly against
// that package's node_modules reuses the existing pinned install (and its
// already-downloaded browser binary) instead of adding a second copy.
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../../..');
const require = createRequire(import.meta.url);
// Plain `require`, not dynamic `import()`: playwright's CJS export shape
// isn't reliably picked up as named ESM exports, so `{ chromium }` off an
// `import()` namespace comes back `undefined` — `require()` gives the real
// `module.exports` object directly.
const { chromium } = require(require.resolve('playwright', { paths: [path.join(repoRoot, 'packages/inem-worker')] }));

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';
const USERNAME = process.env.REDINFO_USERNAME || 'admin@redcross.local';
const PASSWORD = process.env.REDINFO_PASSWORD || 'Admin1234!';

function parseArgs(argv) {
  const [command, route, ...rest] = argv;
  const opts = { width: 390, height: 844, outfile: null };
  const positional = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--width') opts.width = Number(rest[++i]);
    else if (rest[i] === '--height') opts.height = Number(rest[++i]);
    else positional.push(rest[i]);
  }
  opts.outfile = positional[0] ?? null;
  return { command, route, ...opts };
}

async function login(page) {
  await page.goto(`${BASE_URL}/#/login`, { waitUntil: 'networkidle' });
  await page.locator('input[name="username"], input[type="email"], #username').first().fill(USERNAME);
  await page.locator('input[name="password"], input[type="password"]').first().fill(PASSWORD);
  await page.locator('button[type="submit"]').first().click();
  // No stable post-login selector across every screen — the dashboard's
  // first card renders at different speeds depending on what it fetches.
  await page.waitForTimeout(2000);
}

/** Every element whose own rendered width exceeds the viewport, narrowest
 *  (closest to the actual offender) first. Ancestors of the real culprit
 *  inherit its width and show up too, wider still — read from the top and
 *  the first block-ish item with a small, specific-looking class is usually
 *  the source; block-caching the whole chain (`.layout`, `RaLayout-*`,
 *  `MuiPaper-root`) is expected and NOT the source, it's just faithfully
 *  reporting what a wider descendant forced it to. */
async function findOverflowOffenders(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const all = Array.from(document.querySelectorAll('body *'));
    return all
      .map((el) => {
        const r = el.getBoundingClientRect();
        return {
          tag: el.tagName,
          cls: (el.className || '').toString().slice(0, 90),
          width: Math.round(r.width),
          text: (el.textContent || '').trim().slice(0, 50),
        };
      })
      .filter((o) => o.width > vw + 1)
      .sort((a, b) => a.width - b.width)
      .slice(0, 15);
  });
}

async function main() {
  const { command, route, width, height, outfile } = parseArgs(process.argv.slice(2));
  if (!command || !route || (command === 'shot' && !outfile)) {
    console.error(
      'Usage:\n' +
        '  node driver.mjs shot     <route> <outfile.png> [--width N] [--height N]\n' +
        '  node driver.mjs overflow <route>               [--width N] [--height N]',
    );
    process.exitCode = 1;
    return;
  }

  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    await login(page);
    await page.goto(`${BASE_URL}/#${route}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);

    if (command === 'shot') {
      await page.screenshot({ path: outfile, fullPage: true });
      console.log(`Screenshot saved: ${outfile}`);
    } else if (command === 'overflow') {
      const dims = await page.evaluate(() => ({
        innerWidth: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      const overflowing = dims.scrollWidth > dims.innerWidth + 1;
      console.log(JSON.stringify(dims));
      if (overflowing) {
        console.log(`OVERFLOW: page is ${dims.scrollWidth}px wide in a ${dims.innerWidth}px viewport.`);
        const offenders = await findOverflowOffenders(page);
        console.log('Narrowest-first offenders (first one is usually the real source):');
        console.log(JSON.stringify(offenders, null, 2));
      } else {
        console.log('OK: no horizontal overflow.');
      }
    } else {
      console.error(`Unknown command: ${command}`);
      process.exitCode = 1;
    }

    if (consoleErrors.length > 0) {
      console.log('Console errors seen during navigation:');
      for (const e of consoleErrors) console.log(' -', e);
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
