import { defineConfig } from 'vite';
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
});
