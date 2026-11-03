# ADR 0013 — Adopt the shared CI package and a single-job gate

- **Status:** Accepted
- **Date:** 2026-11-03
- **Related:** constitution principles 5, 9 and 10; ADRs 0003, 0005, 0006, 0009, 0011; pocket-factory
  ADR 0012

## TL;DR

pocket-comms runs its CI gates from the shared npm package `@smotastic/pocket-ci` instead of its
own copies in `tools/`, in one CI job, `verify`. This adopts pocket-factory's ADR 0012 ("One shared
CI package and a single-job gate") for this repository. A CI change is a bump of the catalog entry.

## Context

One runner with two job slots serves all the pocket repositories. This repository's `ci.yml` had
seven jobs plus the `ci-success` fan-in, and every job checked out and installed again; `build`
uploaded its outputs only for `test-typecheck` to download them. The gates in `tools/` were a copy
of pocket-factory's that had already drifted from it (the OpenAPI retired list, the design-token
contrast check), so a fix in one repository did not reach the other. pocket-factory moved the
gates into `@smotastic/pocket-ci`, published to the Gitea npm registry (its ADR 0012).

## Decision

We will:

- pin `@smotastic/pocket-ci` in the catalog of `pnpm-workspace.yaml` and install it as a root dev
  dependency; `.npmrc` maps the `@smotastic` scope to the Gitea npm registry, and CI authenticates
  with the `REGISTRY_TOKEN` secret (`read:package`) through the `setup-node-pnpm` action;
- run one CI job, `verify`: checkout, install, `pnpm exec pocket-ci verify`, which runs every step
  even after a failure and names every failed step at the end. It is the required status check
  `CI / verify` on `master`; `CI success`, the gatekeeper job and its wiring check are gone;
- call the gates through the package: the root scripts (`ports:check`, `tokens:check`,
  `openapi:*`, `validate:conventions`, `verify`, `verify:local`), the route-tree check of
  `comms-web` and the shared layer paths of `.dependency-cruiser.cjs`;
- delete the gate copies in `tools/` and their self-tests, which live in the package's source
  repository now. Tests of this repository's own code stay with it: the token build tests are the
  `design-tokens` project's `test` target, and the template tests are the `template` project's.

## Consequences

- **Positive:** one setup instead of eight jobs and no artifact round trip; an agent sees every
  failure of a run at once; gate fixes arrive as a version bump and the copies can no longer
  drift.
- **Negative / trade-offs:** the steps run one after the other in one job. Installing needs a
  registry token, in CI and on every developer machine. The OpenAPI diff no longer has a list of
  retired documents: removing a committed document is always breaking. The gate configuration
  (`.dependency-cruiser.cjs`, `eslint.config.mjs`, `redocly.yaml`) stays a copy in this
  repository and is not proven by the package's self-tests.
- **Follow-ups:** change the required status check on `master` from `CI success` to `CI / verify`;
  add the Actions secret `REGISTRY_TOKEN`; take later gate changes as catalog bumps.
