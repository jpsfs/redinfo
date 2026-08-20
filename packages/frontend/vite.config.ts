// `vitest/config` re-exports vite's defineConfig with the `test` block typed.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://backend:3000',
        changeOrigin: true,
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
