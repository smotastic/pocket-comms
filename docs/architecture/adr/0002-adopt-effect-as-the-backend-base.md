# ADR 0002 — Adopt Effect as the backend base

- **Status:** Accepted
- **Date:** 2026-10-19
- **Related:** constitution principles 1, 3, 5, 10; ADRs 0003, 0004, 0005

## TL;DR

We will build every backend service on [Effect](https://effect.website/) 4: typed effects,
services and layers, Schema, the HTTP API modules and built-in observability. Errors, dependencies
and wire schemas become part of the type, so the compiler, and with it CI, checks what agents
would otherwise only claim.

## Context

Agents write most of the code. The more the type system checks, the more CI proves (principle 5).
Drivers:

- **No ad-hoc error shapes (principle 10).** Every expected failure must be visible and handled.
- **Machine-enforced layers (principle 1).** Layers must be easy to wire and to test with fakes.
- **Contracts first (principle 3).** Wire schemas must validate at runtime and produce OpenAPI.

**Scope:** the programming model and framework of backend services. Not the database (ADR 0004)
or the frontend (ADR 0008).

## Options

| Criterion                 | NestJS + Zod + Drizzle           | Effect full stack                        |
| ------------------------- | -------------------------------- | ---------------------------------------- |
| Typed errors              | ❌ thrown exceptions             | ✅ part of the effect type               |
| Layer fit and testability | ⚠️ decorator DI, needs container | ✅ services and layers; swap test layers |
| Contract schemas          | ✅ Zod, OpenAPI via extra tools  | ✅ Schema produces OpenAPI directly      |
| Agent familiarity         | ✅ much training data            | ⚠️ less data, v4 API differs from v3     |
| Observability             | ⚠️ separate instrumentation      | ✅ spans, metrics, logs built in         |
| API stability             | ✅ stable                        | ⚠️ 4.0 is a release candidate            |

A NestJS + Effect hybrid was rejected early: two DI and two error models side by side.

## Decision

We will use Effect 4 as the base of every backend service:

- **Programming model.** Use cases and adapters return `Effect` values. Expected failures are
  tagged errors in the error channel; unexpected failures are defects. We do not throw for
  expected failures.
- **Dependency injection.** Ports are `Context.Service` classes; adapters are `Layer`s; each app
  composes its layers in one composition root (ADR 0003).
- **Domain.** The domain imports only pure `effect` modules: `Schema`, `Data`, `Brand`, `Option`,
  `Result`, `Equal`, `Order`, `Array`, `Record`, `Struct`, `Predicate`, `Function`, `Match`,
  `DateTime`, `BigDecimal`. No services, layers or I/O.
- **Schemas.** Effect Schema is the only schema library. No Zod.
- **HTTP.** APIs are declared with `effect/http-api` and served with `@effect/platform-node`
  (ADR 0005).
- **Configuration and telemetry** go through `Config` and Effect's tracing, metrics and logs.
- **Tests** use Vitest with `@effect/vitest` and test layers in place of infrastructure.
- **Versions.** All Effect packages come from the `pnpm-workspace.yaml` catalog, pinned to one
  exact version, and move together.

## Consequences

- **Positive:** a use case signature shows its dependencies and failures; tests swap layers
  instead of mocking; one schema serves validation, contracts and OpenAPI.
- **Negative / trade-offs:** agents write Effect less reliably than plain TypeScript, so the
  `effect` skill and the blueprint must guide them; reviewers must learn effects and layers; a
  release candidate can cause rework.
- **Follow-ups:** move to Effect 4.0 stable when it ships.
