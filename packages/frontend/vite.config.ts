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
// depending on which environment's image this is (see .env.example and
// packages/frontend/Dockerfile).
//
// Not using Vite's own built-in %VITE_APP_TITLE% HTML env replacement: it
// only reaches HTML entry points, not public/ files copied verbatim to dist
// like manifest.webmanifest — and its "not defined in env variables" warning
// fires whenever the var is genuinely unset (e.g. a bare `pnpm build`
// outside Docker/compose), with no way to feed it our own fallback. Doing
// both substitutions ourselves keeps title and manifest in lockstep and
// warning-free everywhere.
function injectAppTitle(title: string): Plugin {
  let root = process.cwd();
  let outDir = 'dist';
  const manifestRelPath = 'manifest.webmanifest';
  return {
    name: 'inject-app-title',
    configResolved(config) {
      root = config.root;
      outDir = config.build.outDir;
    },
    transformIndexHtml(html) {
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

  return {
    plugins: [react(), injectAppTitle(appTitle)],
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
        },
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
