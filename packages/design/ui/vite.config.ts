import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Library mode for `dist/`; web apps consume `src/` through the `@pocket-comms/source` condition instead.
// React and the token constants stay external so an app bundles one copy of each; the token CSS
// (a separate module id) is bundled into `style.css`.
export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vite/packages/design/ui',
  plugins: [react()],
  resolve: { conditions: ['@pocket-comms/source'] },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    lib: { entry: 'src/index.ts', formats: ['es'], fileName: 'index', cssFileName: 'style' },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime', '@pocket-comms/design-tokens'],
    },
  },
  test: {
    name: 'design-ui',
    environment: 'jsdom',
    // Process CSS Modules, so a class a component uses must exist in its stylesheet; unprocessed,
    // every lookup returns a made-up name.
    css: { include: [/\.module\.css$/] },
    include: ['src/**/*.spec.{ts,tsx}'],
    coverage: { reportsDirectory: './test-output/vitest/coverage', provider: 'v8' },
  },
});
