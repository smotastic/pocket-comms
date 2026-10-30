import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vite/packages/comms/application',
  resolve: { conditions: ['@pocket-comms/source'] },
  ssr: { resolve: { conditions: ['@pocket-comms/source'] } },
  test: {
    name: 'comms-application',
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    coverage: { reportsDirectory: './test-output/vitest/coverage', provider: 'v8' },
  },
});
