import { defineConfig } from 'vite';
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
});
