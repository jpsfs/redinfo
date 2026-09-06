---
name: run-frontend
description: Run, log into, and screenshot the redinfo frontend (packages/frontend) in a real headless browser — start the docker compose stack, then drive it with driver.mjs to open a route at a given viewport, take a screenshot, or check it for horizontal overflow on mobile. Use when asked to run the app, view a screen, screenshot a page, or verify a change is mobile-friendly.
---

The redinfo frontend is a react-admin SPA (hash routing, `/#/...`) served by
Vite dev server via `docker compose`, behind a login screen. Drive it with
`.claude/skills/run-frontend/driver.mjs`, a small Playwright script that logs
in, navigates to a route, and either screenshots it or checks it for
horizontal overflow. All paths below are relative to the repo root.

## Prerequisites

`docker` needs `sudo -n` in this environment (the user isn't in the `docker`
group). Bring up the stack:

```bash
sudo -n docker compose up -d --build
```

This starts `postgres`, `postgres-test`, `backend` (port 3000), and
`frontend` (Vite dev server, port 5173). Wait for it to actually serve:

```bash
timeout 60 bash -c 'until curl -sf http://localhost:5173 >/dev/null; do sleep 1; done'
```

The driver needs a headless Chromium. **Don't add `playwright` as a new
dependency** — it's already pinned at `packages/inem-worker/package.json`
(`"playwright": "1.62.1"`, used for real to drive INEM's login flow), so the
browser binary lives in the shared pnpm store already. Check before
installing anything:

```bash
ls ~/.cache/ms-playwright 2>/dev/null   # if chromium-* dirs are already there, skip the next line
node node_modules/.pnpm/playwright@1.62.1/node_modules/playwright/cli.js install chromium
```

Chrome needs a handful of system libraries this container may not have.
Check first, then install only what's missing:

```bash
ldconfig -p | grep -q libnspr4.so || sudo -n apt-get install -y \
  libnspr4 libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
  libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
  libgbm1 libasound2t64 libatspi2.0-0
```

## Run (agent path)

```bash
node .claude/skills/run-frontend/driver.mjs shot     "/volunteer-hours/review" /tmp/shot.png [--width 390] [--height 844]
node .claude/skills/run-frontend/driver.mjs overflow "/volunteer-hours/review" [--width 390] [--height 844]
```

The route is a react-admin hash path (`/`, `/my-hours`,
`/volunteer-hours/review`, ...) — the driver turns it into
`http://localhost:5173/#<route>`. It logs in first using the seeded dev admin
(`admin@redcross.local` / `Admin1234!`, from `packages/backend/prisma/seed.ts`)
before navigating. Default viewport is 390×844 (matches this repo's own
`MOBILE_WIDTH` in `packages/frontend/src/test/renderMobile.tsx`); pass
`--width`/`--height` for a desktop check.

| command | what it does |
|---|---|
| `shot <route> <outfile.png>` | Full-page screenshot after login + navigation. **Actually look at it** — see Gotchas. |
| `overflow <route>` | Compares `window.innerWidth` to `document.documentElement.scrollWidth`. If they differ, walks the DOM for every element wider than the viewport (narrowest-first) so you can spot the actual offender instead of just its ballooned ancestors. |

Both commands print any browser console errors seen during the navigation.

Env overrides: `BASE_URL` (default `http://localhost:5173`),
`REDINFO_USERNAME` / `REDINFO_PASSWORD` (default the seeded dev admin above).

## Run (human path)

```bash
sudo -n docker compose up -d --build   # then open http://localhost:5173 in a real browser
```

Log in with the same seeded admin credentials. `docker compose logs -f frontend`
to watch Vite's own output; there's no way to resize a real browser window
to an exact mobile viewport as reliably as the driver does, so prefer the
driver for anything viewport-specific.

## Test

The actual test suites (`pnpm --filter frontend test`, etc.) are documented
in the repo's own `CLAUDE.md` — this skill is specifically for visually
driving the running app, not for the unit/integration suites.

---

## Gotchas

- **A screenshot alone can lie.** A page can be laid out wider than the
  viewport while looking fine in a scaled-down screenshot preview — the
  image is just wider than you think it is. This is exactly how a real bug
  was found: `ReviewFilters`'s filter-chip row used `overflowX: 'auto'` to
  scroll horizontally in place, but nested inside `Card > CardContent >
  Stack` with no definite width anywhere in that chain, the browser never
  actually clipped it — the whole page rendered at 712px in a 390px
  viewport, chips and all, and the screenshot just looked "fine" scaled
  down. Always run `overflow` alongside `shot` when checking mobile layout,
  not just `shot`.
- **The `overflow` offender list reports effects, not just causes.** Every
  ancestor of the real offending element (`.layout`, `RaLayout-content`,
  `MuiPaper-root`, ...) also shows up wider than the viewport, because it's
  faithfully sized to contain its wide child — that's expected, not a
  separate bug. Read the list narrowest-first; the first specific-looking
  element (not a generic layout wrapper) is usually the actual source.
- **`import('playwright')` returns `chromium: undefined`.** Playwright's CJS
  export shape isn't reliably synthesized into named ESM exports by Node's
  cjs-module-lexer. The driver uses `require()` (via `createRequire`)
  instead of dynamic `import()` for this reason — if you're extending the
  driver, keep doing the same.
- **Hash routing.** react-admin routes are `/#/path`, not `/path` — the
  driver adds the `#` for you; don't double it in the `<route>` argument.
- **A few `404`s in the console are normal** (seen after login, unrelated to
  any specific page — looked like manifest/icon assets) and aren't a sign
  the app failed to load; don't chase them unless they're new.

## Troubleshooting

- **`TypeError: Cannot read properties of undefined (reading 'launch')`**:
  playwright was imported with `import()` instead of `require()` — see the
  Gotcha above.
- **`error while loading shared libraries: libnspr4.so: cannot open shared
  object file`**: the system libraries Chromium needs aren't installed — run
  the `apt-get` line in Prerequisites.
- **`Executable doesn't exist at .../chromium-*/...`**: the browser binary
  hasn't been downloaded for the pinned playwright version — run the
  `playwright ... install chromium` line in Prerequisites (must match
  `packages/inem-worker/package.json`'s pinned `1.62.1`, not whatever
  version `npx playwright` would resolve on its own).
