import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vite/packages/comms/contract',
  resolve: { conditions: ['@pocket-comms/source'] },
  ssr: { resolve: { conditions: ['@pocket-comms/source'] } },
  test: {
    name: 'comms-contract',
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    coverage: { reportsDirectory: './test-output/vitest/coverage', provider: 'v8' },
  },
});
