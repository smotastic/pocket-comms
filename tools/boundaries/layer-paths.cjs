// The path shapes of the layer packages. `.dependency-cruiser.cjs` and the port structure check
// (`tools/ports/check.mjs`) both use them, so the two gates always see the same layers.

/** The root folder of a service: `packages/<service>/` or `blueprints/<blueprint>/packages/`. */
const SERVICE_ROOT = '^(?:packages/[^/]+|blueprints/[^/]+/packages)/';

/** A path inside one of the given layer packages of any service, e.g. `layerLevel('domain')`. */
const layerLevel = (layers) => `${SERVICE_ROOT}(?:${layers})/`;

module.exports = { SERVICE_ROOT, layerLevel };
