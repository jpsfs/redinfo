// `vitest/config` re-exports vite's defineConfig with the `test` block typed,
// but not loadEnv/Plugin — those come from `vite` itself.
import { defineConfig } from 'vitest/config';
import { loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

// index.html and manifest.webmanifest both carry an __APP_TITLE__ placeholder
// (see those files) that this plugin substitutes with the resolved
// VITE_APP_TITLE (falling back to the dev default below), so the tab title
// and installed-app name read "RedInfo - Dev" / "RedInfo - QA" / "CVP Portal"
// depending on which environment this is (see .env.example).
//
// Not using Vite's own built-in %VITE_APP_TITLE% HTML env replacement: it
// only reaches HTML entry points, not public/ files copied verbatim to dist
// like manifest.webmanifest — and its "not defined in env variables" warning
// fires whenever the var is genuinely unset (e.g. a bare `pnpm build`
// outside Docker/compose), with no way to feed it our own fallback. Doing
// both substitutions ourselves keeps title and manifest in lockstep and
// warning-free everywhere.
//
// Build-once/promote: a production `vite build` only substitutes here when
// VITE_APP_TITLE is explicitly set (local/compose builds may still do this
// via the Dockerfile's ARG). Otherwise the placeholder is left untouched in
// dist/index.html and dist/manifest.webmanifest on purpose, so ONE image can
// be built and promoted staging → production — the actual title is stamped
// in at container start by packages/frontend/docker-entrypoint-app-title.sh
// (installed as an nginx `/docker-entrypoint.d/` script, see Dockerfile),
// from that environment's APP_TITLE (see deploy/redinfo/values.*.yaml). The
// dev server always substitutes, since there's no "build once" concern there.
function injectAppTitle(title: string, substituteAtBuild: boolean): Plugin {
  let root = process.cwd();
  let outDir = 'dist';
  const manifestRelPath = 'manifest.webmanifest';
  return {
    name: 'inject-app-title',
    configResolved(config) {
      root = config.root;
      outDir = config.build.outDir;
    },
    transformIndexHtml(html, ctx) {
      // `ctx.server` is only set in dev (this hook also runs during
      // `vite build`, where it's undefined) — see substituteAtBuild's own
      // comment above for why build only sometimes substitutes.
      const isDev = Boolean(ctx.server);
      if (!isDev && !substituteAtBuild) return html;
      return html.replaceAll('__APP_TITLE__', title);
    },
    configureServer(server) {
      server.middlewares.use(`/${manifestRelPath}`, (_req, res) => {
        const raw = fs.readFileSync(path.join(server.config.root, 'public', manifestRelPath), 'utf-8');
        res.setHeader('Content-Type', 'application/manifest+json');
        res.end(raw.replaceAll('__APP_TITLE__', title));
      });
    },
    closeBundle() {
      if (!substituteAtBuild) return;
      const outFile = path.join(root, outDir, manifestRelPath);
      if (!fs.existsSync(outFile)) return;
      const raw = fs.readFileSync(outFile, 'utf-8');
      fs.writeFileSync(outFile, raw.replaceAll('__APP_TITLE__', title));
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  // Falls back to the dev branding so a bare `vite`/`vite build` with no env
  // configured (e.g. a first-time checkout) doesn't ship a blank tab title.
  const appTitle = env.VITE_APP_TITLE || 'RedInfo - Dev';
  // Only an explicit VITE_APP_TITLE opts a build into stamping the title in
  // at build time — see injectAppTitle's own comment above.
  const substituteAtBuild = Boolean(env.VITE_APP_TITLE);

  return {
    plugins: [react(), injectAppTitle(appTitle, substituteAtBuild)],
    server: {
      host: '0.0.0.0',
      port: 5173,
      // Dev server is reached via docker-compose port mapping from other machines
      // (e.g. http://myvm:5173) — Vite's DNS-rebind protection would otherwise
      // reject requests whose Host header isn't localhost/127.0.0.1.
      allowedHosts: true,
      proxy: {
        // Mirrors nginx's prod behaviour (nginx/nginx.conf): /api/* is stripped
        // to / before reaching the backend, which mounts its routes at the root.
        '/api': {
          target: 'http://backend:3000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
        '/auth': {
          target: 'http://backend:3000',
          changeOrigin: true,
          // Mirrors nginx's exact-match carve-out (nginx/nginx.conf,
          // deploy/redinfo/templates/configmap-nginx.yaml): /auth/callback is
          // the SPA's own OAuth landing route, not a backend route, so it must
          // NOT be forwarded like the rest of /auth/* is. Without this, the
          // backend 404s on it (no such route) and the OAuthCallback component
          // never gets a chance to run. Only the path form reaches here — the
          // backend redirects to /#/auth/callback, which the dev server sees
          // as a plain request for /.
          bypass: (req) => {
            const path = req.url?.split('?')[0];
            if (path === '/auth/callback') return req.url;
          },
        },
        // ── MCP: OAuth 2.1 Authorization Server + the /mcp resource server ──
        // Mirrors nginx/nginx.conf's own copy of this block — the exact
        // root-level paths the MCP SDK's `mcpAuthRouter` fixes per spec
        // (RFC 8414/9728/7591), reached directly by an external AI client.
        // No bypass carve-out needed for /oauth/consent (the SPA's own
        // route): unlike /auth, there is no blanket /oauth proxy rule here
        // to shadow it — this app's OAuth consent/grants API calls go
        // through /api/oauth/..., matching every other resource.
        '/mcp': { target: 'http://backend:3000', changeOrigin: true, ws: true },
        '/.well-known': { target: 'http://backend:3000', changeOrigin: true },
        '/authorize': { target: 'http://backend:3000', changeOrigin: true },
        '/token': { target: 'http://backend:3000', changeOrigin: true },
        '/register': { target: 'http://backend:3000', changeOrigin: true },
        '/revoke': { target: 'http://backend:3000', changeOrigin: true },
      },
    },
    resolve: {
      alias: [
        // Route all @mui/icons-material CJS sub-path imports to the ESM build to
        // avoid Vite's __toESM interop exporting the whole module object as default.
        {
          find: /^@mui\/icons-material\/(?!esm\/)(.+)$/,
          replacement: '@mui/icons-material/esm/$1',
        },
        {
          find: '@redinfo/shared',
          replacement: new URL('../shared/src/index.ts', import.meta.url).pathname,
        },
      ],
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      /**
       * Well above what any single case needs.
       *
       * The component tests here mount real react-admin trees with real MUI, and
       * the slowest of them take 1–2s alone but 5s+ when a dozen workers are
       * competing for the same cores. The default 5s made those fail on a busy
       * machine and pass on a quiet one, which is the least useful kind of test
       * result — a genuinely hung test still fails, just later.
       */
      testTimeout: 20_000,
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
      server: {
        deps: {
          // react-admin ships CJS-style directory imports of @mui/material that
          // Node's ESM resolver rejects; inlining makes Vite resolve them (and
          // apply the @mui/icons-material alias above) instead.
          inline: true,
        },
      },
    },
  };
});
