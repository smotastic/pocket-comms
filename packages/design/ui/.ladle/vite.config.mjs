// Resolves workspace packages from source, like the web apps do; the rest are Vite's defaults.
export default {
  resolve: { conditions: ['@pocket-comms/source', 'module', 'browser', 'development|production'] },
};
