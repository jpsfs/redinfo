// `vitest/config` re-exports vite's defineConfig with the `test` block typed.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
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
});
