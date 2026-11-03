import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// The comms server of `apps/comms-server` (`nx run comms-server:dev`).
const API_URL = process.env['API_URL'] ?? 'http://127.0.0.1:4410';

// In production `tailscale serve` adds the caller's Tailscale login, which the server requires.
// The dev server stands in for it: it listens on this machine only and adds the allowed login.
const LOGIN = process.env['COMMS_ALLOWED_LOGIN'] ?? 'smotastic@';
const DEV_LOGIN = LOGIN.endsWith('@') ? `${LOGIN}dev` : LOGIN;

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/comms-web',
  plugins: [tanstackRouter(), react()],
  resolve: { conditions: ['@pocket-comms/source'] },
  server: {
    host: '127.0.0.1',
    port: 4200,
    proxy: { '/api': { target: API_URL, headers: { 'tailscale-user-login': DEV_LOGIN } } },
  },
  build: { outDir: 'dist', emptyOutDir: true },
  test: {
    name: 'comms-web',
    environment: 'jsdom',
    include: ['src/**/*.spec.{ts,tsx}'],
    // Longer than the five seconds a `findBy` waits (see testing.tsx), so a slow first render on a
    // busy runner fails on what it waited for, not on the test's own timeout.
    testTimeout: 15_000,
    coverage: { reportsDirectory: './test-output/vitest/coverage', provider: 'v8' },
  },
});
