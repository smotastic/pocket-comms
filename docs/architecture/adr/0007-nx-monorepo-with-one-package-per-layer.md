# ADR 0007 — Nx monorepo with one package per layer

- **Status:** Accepted
- **Date:** 2026-10-19
- **Related:** constitution principles 1, 5, 9; ADR 0003

## TL;DR

We will keep one pnpm workspace managed by Nx, with one package per layer of each service. The
package boundary makes a forbidden import a missing dependency, Nx tags make it a lint error, and
`nx affected` keeps local checks and CI fast as the repository grows.

## Context

Layers are only as strong as their enforcement (principle 1). A repository holds backends,
web apps and tools side by side. Simpler setups exist: one package per app with layer folders, or
a plain pnpm workspace without Nx.

## Options

| Criterion             | Layer folders, no Nx     | Nx + one package per layer      |
| --------------------- | ------------------------ | ------------------------------- |
| Layer enforcement     | ⚠️ path rules only       | ✅ dependencies, tags and paths |
| Files per service     | ✅ few                   | ⚠️ one manifest set per layer   |
| Run only what changed | ❌ everything every time | ✅ `nx affected` and caching    |
| Concepts to learn     | ✅ pnpm only             | ⚠️ Nx targets, tags and sync    |

## Decision

- **Workspace.** pnpm workspaces with a `catalog:` in `pnpm-workspace.yaml` for every external
  version; `syncpack` keeps manifests consistent.
- **Layout.** `apps/` for runnable applications, `packages/` for libraries. A service has
  `packages/<service>/{contract,domain,application,infrastructure,api}` and an app in `apps/`.
- **Packages.** Each package is named `@pocket-comms/<name>`, exposes its sources under the `@pocket-comms/source`
  export condition, and declares only the dependencies it imports.
- **Nx.** Targets are inferred by the `@nx/js`, `@nx/vitest` and `@nx/eslint` plugins.
  `pnpm nx sync` keeps TypeScript project references current. Local checks and CI run
  `nx affected`.
- **Tags.** Every project has `scope:<service>` (or `scope:shared`, `scope:contracts`) and either
  `layer:domain|application|infrastructure`, `type:app` or `type:web`. ESLint's
  `@nx/enforce-module-boundaries` checks the tags; dependency-cruiser checks the same direction by
  path.

## Consequences

- **Positive:** three independent checks for every boundary; fast, incremental CI.
- **Negative / trade-offs:** a new service means several small packages with their own
  `package.json`, `project.json`, `tsconfig` files and `vite.config.ts`. The blueprint is the
  copy source.
- **Follow-ups:** none.
