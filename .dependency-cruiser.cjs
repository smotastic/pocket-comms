// Architecture-boundary rules for the workspace. This file is the source of truth for them
// (ADR 0003, ADR 0007): it is the only tool here that sees the transitive import graph and cycles.
// `eslint.config.mjs` mirrors the layer directions at the project level for inline editor
// feedback — add a new rule here first, and prove it fires in the self-tests of `@smotastic/pocket-ci` before relying
// on it.

// The layer path shapes live in `@smotastic/pocket-ci/layer-paths`, which the port structure check
// shares.
const { layerLevel } = require('@smotastic/pocket-ci/layer-paths');

const DOMAIN_LEVEL = layerLevel('domain');
const APPLICATION_LEVEL = layerLevel('application');
// Single alternations of layer names, because dependency-cruiser refuses a regex that repeats them.
const OUTSIDE_DOMAIN = layerLevel('application|infrastructure|api');
const ADAPTERS = layerLevel('infrastructure|api');
const SERVER_LAYERS = layerLevel('domain|application|infrastructure|api');
const CORE = layerLevel('domain|application');

// Wire schemas: the shared ones in `packages/contracts/`, and the contract package of a service.
const CONTRACTS = `^packages/contracts/|${layerLevel('contract')}`;

// The design system (ADR 0014): the published package `@smotastic/pocket-design`, for web apps only.
const DESIGN = '(?:^|/)(?:node_modules/)?@smotastic/pocket-design/';
const WORKSPACE = '^(?:apps|packages|blueprints)/';

// Web apps follow a naming convention, so this file can tell them from servers and CLIs: the
// folder name ends in `web` (`apps/web/`, `apps/<name>-web/`, `blueprints/<blueprint>/apps/web/`).
const WEB_APP = '^(?:apps|blueprints/[^/]+/apps)/[^/]*web/';
// Servers likewise end in `server` (`apps/server/`, `apps/<name>-server/`).
const SERVER_APP = '^(?:apps|blueprints/[^/]+/apps)/[^/]*server/';

// The pure modules of `effect` that the domain may import (ADR 0002). Everything else in the
// package performs or describes effects, services or I/O.
const PURE_EFFECT_MODULES = [
  'Schema',
  'Data',
  'Brand',
  'Option',
  'Result',
  'Equal',
  'Order',
  'Array',
  'Record',
  'Struct',
  'Predicate',
  'Function',
  'Match',
  'DateTime',
  'BigDecimal',
];

// Test files and the test configuration may import the test runner.
const NOT_TEST_CODE = '\\.spec\\.ts$|/vite\\.config\\.ts$';

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // ── Technical layers (domain → application → infrastructure) ────────────────────────────
    {
      name: 'no-domain-to-outer-layers',
      comment:
        'The domain knows nothing about the layers around it: not the application, not the ' +
        'infrastructure, not the HTTP adapter (ADR 0003).',
      severity: 'error',
      from: { path: DOMAIN_LEVEL },
      to: { path: OUTSIDE_DOMAIN },
    },
    {
      name: 'no-application-to-adapters',
      comment:
        'The application layer reaches adapters only through its ports; the composition root ' +
        'wires them (ADR 0003).',
      severity: 'error',
      from: { path: APPLICATION_LEVEL },
      to: { path: ADAPTERS },
    },
    {
      name: 'no-framework-imports-in-domain',
      comment:
        'The domain may import only the pure effect modules of ADR 0002 (effect/Schema, ' +
        'effect/Data, …) through their subpaths. The effect barrel, effect services and layers, ' +
        'HTTP, SQL and any other framework belong to the outer layers. The barrel is forbidden ' +
        'because this tool sees modules, not named imports.',
      severity: 'error',
      from: { path: DOMAIN_LEVEL, pathNot: NOT_TEST_CODE },
      to: {
        path: 'node_modules/',
        pathNot: `node_modules/effect/dist/(?:${PURE_EFFECT_MODULES.join('|')})\\.(?:js|d\\.ts)$`,
      },
    },
    {
      // The same rule for the imports the path rule above cannot see: a Node.js built-in resolves
      // to its bare name, and a package that does not resolve has no `node_modules/` path.
      name: 'no-framework-imports-in-domain',
      comment:
        'The domain must not import Node.js built-in modules; it performs no I/O (ADR 0002).',
      severity: 'error',
      from: { path: DOMAIN_LEVEL, pathNot: NOT_TEST_CODE },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'no-framework-imports-in-domain',
      comment:
        'A domain import must resolve, so the rules above can check it; an unresolved package ' +
        'would pass them unseen.',
      severity: 'error',
      from: { path: DOMAIN_LEVEL, pathNot: NOT_TEST_CODE },
      to: { couldNotResolve: true },
    },
    {
      name: 'no-domain-in-handlers',
      comment:
        'HTTP handlers (`*.handlers.ts`) map the wire contract to application DTOs and call the ' +
        'inbound port; no domain type crosses the HTTP boundary (ADR 0003).',
      severity: 'error',
      from: { path: '\\.handlers\\.ts$' },
      to: { path: DOMAIN_LEVEL },
    },
    {
      name: 'no-contracts-in-core',
      comment:
        'Domain and application work on their own types. Adapters map to and from the wire ' +
        'contract at the edge (ADR 0003).',
      severity: 'error',
      from: { path: CORE },
      to: { path: CONTRACTS },
    },
    {
      name: 'no-server-code-in-web',
      comment:
        'A web app talks to a service only through its contract package and the typed client ' +
        '(ADR 0008); server layers never reach the browser bundle.',
      severity: 'error',
      from: { path: WEB_APP },
      to: { path: SERVER_LAYERS },
    },
    // ── Services and blueprints ──────────────────────────────────────────────────────────────
    {
      name: 'no-cross-service',
      comment:
        'A service (`packages/<service>/`) may import its own packages and the shared ones ' +
        '(`packages/backend-shared/`, `packages/contracts/`), never another ' +
        'service. Services integrate over their HTTP contracts, not by compiling each other in.',
      severity: 'error',
      from: { path: '^packages/([^/]+)/' },
      to: {
        path: '^packages/[^/]+/',
        pathNot: '^packages/(?:$1|backend-shared|contracts)/',
      },
    },
    {
      name: 'no-blueprint-imports',
      comment:
        'A blueprint is a reference to copy from, not a dependency: real apps and packages never ' +
        'import it, so deleting `blueprints/` breaks nothing.',
      severity: 'error',
      from: { path: '^(?:apps|packages)/' },
      to: { path: '^blueprints/' },
    },
    {
      name: 'no-cross-service',
      comment:
        'A blueprint may use the shared packages only, never a real service, so copying or ' +
        'deleting it stays a local change.',
      severity: 'error',
      from: { path: '^blueprints/' },
      to: {
        path: '^(?:apps|packages)/',
        pathNot: '^packages/(?:backend-shared|contracts)/',
      },
    },
    {
      name: 'observability-in-servers-only',
      comment:
        'Only a server composition root wires telemetry (ADR 0010); every other layer just names ' +
        'spans with `Effect.fn` and logs with `Effect.log*`.',
      severity: 'error',
      from: {
        pathNot: `${SERVER_APP}|^packages/backend-shared/src/observability/`,
      },
      to: { path: '^packages/backend-shared/src/observability/' },
    },
    {
      name: 'agent-runtime-in-infrastructure-only',
      comment:
        'An agent runtime is an outbound adapter (ADR 0012): only the infrastructure layer imports ' +
        "Pi's packages; the application defines the tools and the port.",
      severity: 'error',
      from: { path: WORKSPACE, pathNot: layerLevel('infrastructure') },
      to: { path: '(?:^|/)(?:node_modules/)?@earendil-works/' },
    },
    // ── Design system ────────────────────────────────────────────────────────────────────────
    {
      name: 'no-design-in-server-code',
      comment:
        'The design package is for web apps (ADR 0014). Servers, services, shared backend code, ' +
        'contracts and apps that are not web apps never import it.',
      severity: 'error',
      from: { path: WORKSPACE, pathNot: WEB_APP },
      to: { path: DESIGN },
    },
    {
      name: 'no-css-in-web',
      comment:
        'A web app has no stylesheet of its own; its look comes from the design package, so a ' +
        'visual change happens there and every app follows (ADRs 0009 and 0014).',
      severity: 'error',
      from: { path: WEB_APP },
      to: { path: '\\.(?:css|scss|sass|less|styl)$' },
    },
    // ── Circular dependencies ────────────────────────────────────────────────────────────────
    {
      name: 'no-circular',
      comment: 'No circular dependencies.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    // Every workspace package points `import` at a `dist/` that does not exist unbuilt and exposes
    // its sources under `@pocket-comms/source`. Without that condition every `@pocket-comms/*` specifier stays
    // unresolved, and no path-based rule above can match it. The extensions resolve the
    // extensionless imports of a generated TanStack Router route tree (ADR 0011).
    enhancedResolveOptions: {
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
      exportsFields: ['exports'],
      conditionNames: ['@pocket-comms/source', 'types', 'import', 'require', 'node', 'default'],
    },
    // Local build output only, so a run here cruises the same graph as CI's fresh checkout. A bare
    // `dist` would also hide `effect/dist/*.js` and blind `no-framework-imports-in-domain`.
    exclude: '^dist/|^(apps|packages|blueprints|tools)/.*/(?:dist|ladle-build)/',
    doNotFollow: {
      path: 'node_modules',
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: './tsconfig.json',
    },
    reporterOptions: {
      text: {
        highlightFocused: true,
      },
    },
  },
};
