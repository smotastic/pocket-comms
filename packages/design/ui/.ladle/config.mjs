// The component catalog (ADR 0009). Ladle bundles its own Vite, so it gets its own small Vite
// config instead of the kit's, which targets the workspace Vite.
export default {
  stories: 'src/**/*.stories.tsx',
  viteConfig: '.ladle/vite.config.mjs',
  outDir: 'ladle-build',
};
