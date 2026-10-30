import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// The API server of `apps/server` in local mode (`nx run bookmarks-server:dev`).
const API_URL = process.env['API_URL'] ?? 'http://localhost:3001';

// The names, besides IP addresses, under which the dev server answers: Bonjour names
// (`<host>.local`), FRITZ!Box names (`<host>.fritz.box`) and the bare host name `homelab`.
const ALLOWED_HOSTS = ['.local', '.fritz.box', 'homelab'];

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../../../node_modules/.vite/blueprints/bookmarks/apps/web',
  plugins: [tanstackRouter(), react()],
  resolve: { conditions: ['@pocket-comms/source'] },
  // The browser calls `/api` on its own origin; the dev server forwards it to the API server. The
  // `dev` and `preview` targets listen on the network (`--host`), so another machine on the LAN can
  // open the app by IP or by name.
  server: { port: 4200, allowedHosts: ALLOWED_HOSTS, proxy: { '/api': API_URL } },
  preview: { port: 4300, allowedHosts: ALLOWED_HOSTS, proxy: { '/api': API_URL } },
  build: { outDir: 'dist', emptyOutDir: true },
  test: {
    name: 'bookmarks-web',
    environment: 'jsdom',
    include: ['src/**/*.spec.{ts,tsx}'],
    coverage: { reportsDirectory: './test-output/vitest/coverage', provider: 'v8' },
  },
});
