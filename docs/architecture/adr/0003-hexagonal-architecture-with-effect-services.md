# ADR 0003 — Hexagonal architecture with Effect services

- **Status:** Accepted (amended by ADR 0006)
- **Date:** 2026-10-19
- **Related:** constitution principles 1, 2, 9; ADRs 0002, 0006, 0007

## TL;DR

We will structure every backend service as a hexagon (ports and adapters). All ports live in
`application` and are Effect services with an `…Inbound` or `…Outbound` suffix; adapters are
`Layer`s in `infrastructure`; each app wires its layers in one composition root. The compiler
checks that every dependency is provided, and the boundary rules check where each file lives.

## Context

Agents must be able to put every file in exactly one right place, and review must be able to
reject a file in the wrong one. Use cases must be testable without live infrastructure, as
test-first work requires. Effect's services and layers map directly onto ports and adapters.

**Scope:** the layers of a backend service, what each contains and how ports and adapters are
declared and wired. Not the database (ADR 0004) or the HTTP API (ADR 0005).

## Decision

Every backend service has these packages (ADR 0007), under `packages/<service>/` or
`blueprints/<name>/packages/`:

- **`domain`** — entities, value objects, domain rules and domain errors. Pure functions over
  values. It imports only pure `effect` modules (ADR 0002), other domain code and
  `@pocket-comms/backend-shared` kernel types. No ports, services or layers.
- **`application`** — use cases and **all ports**:
  - Outbound ports (`BookmarkRepositoryOutbound`, `IdGeneratorOutbound`) are `Context.Service`
    classes whose methods take and return domain types.
  - Inbound ports (`BookmarksInbound`) are `Context.Service` classes too; the use case code is the
    `Layer` that implements one.
  - DTO schemas in `application/src/dto/` describe what use cases accept and return.
  - Ports live in `application/src/ports/<resource>.inbound.port.ts` and
    `<resource>.outbound.port.ts`.
- **`infrastructure`** — driven adapters: one `Layer` per outbound port implementation, exported
  from its adapter module (`layerSql`, `layerInMemory`, `layerUuidV7`), never a static class
  member. It also holds persistence rows, migrations and the migrator (ADR 0004). Every outbound
  port has at least one adapter.
- **`api`** — driving adapters: HTTP handlers that call the inbound port and map DTOs to and from
  the wire contract (ADR 0005). Tagged `layer:infrastructure`; it never imports `domain` types.
- **Composition root** — the app in `apps/` merges adapters, use cases, API and configuration and
  launches the program. It holds no business logic.

**Errors.** Domain errors live in `domain`; port errors (`BookmarkNotFoundError`) live with the
ports. A use case lists every error it can return. Adapters turn library errors (`SqlError`) into
port errors or defects; a library error never reaches a use case signature.

**Naming.** A port variable is named after the port (`bookmarkRepositoryOutbound`). The service
key is `<service>/application/<PortName>`.

**Enforcement.** Dependency-cruiser and the Nx module boundaries enforce the import direction
`domain ← application ← infrastructure`. `pnpm ports:check` (`pocket-ci ports`, ADR 0013) enforces
what imports cannot: where ports are declared, their file names, exports, keys and suffixes, the
use case layer of each inbound port, and the adapter rules. The self-tests of `@smotastic/pocket-ci`
prove each rule on a deliberate violation.

## Consequences

- **Positive:** a missing adapter is a compile error; tests swap in in-memory layers; every file
  has one folder.
- **Negative / trade-offs:** even a simple resource needs a port, a use case layer, an adapter and
  two mappings. The blueprint shows this cost once so agents can copy it.
- **Follow-ups:** none.
