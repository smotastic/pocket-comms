import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../../../node_modules/.vite/blueprints/bookmarks/apps/server',
  resolve: { conditions: ['@pocket-comms/source'] },
  ssr: { resolve: { conditions: ['@pocket-comms/source'] } },
  test: {
    name: 'bookmarks-server',
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    coverage: { reportsDirectory: './test-output/vitest/coverage', provider: 'v8' },
  },
});
