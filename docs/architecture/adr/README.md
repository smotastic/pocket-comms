# Architecture Decision Records (ADR)

One file per decision, copied from [`0000-template.md`](0000-template.md) and named
`NNNN-kebab-title.md` with a 4-digit, sequential number.

## Lifecycle

- **Status** is `Proposed`, `Accepted`, `Superseded by ADR-XXXX` or `Deprecated`. The index below
  shows the same status as the file.
- A `Proposed` ADR is a draft and may change freely. An `Accepted` ADR's decision is not
  rewritten.
- **Amendment:** a later ADR changes part of an accepted one. Set the old status to
  `Accepted (amended by ADR NNNN)`.
- **Supersession:** the decision changes. Write a new ADR and set the old status to
  `Superseded by ADR-NNNN`.
- **Fact drift:** when the code no longer matches the supporting text, prepend a dated note
  (`> **As-built note (YYYY-MM-DD).** …`) instead of rewriting the text.

Accepting an ADR needs the human owner's approval.

## Index

| ADR                                                                     | Title                                                   | Status                                |
| ----------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------- |
| [0001](0001-adopt-the-template-ruleset.md)                              | Adopt the template ruleset                              | Accepted                              |
| [0002](0002-adopt-effect-as-the-backend-base.md)                        | Adopt Effect as the backend base                        | Accepted                              |
| [0003](0003-hexagonal-architecture-with-effect-services.md)             | Hexagonal architecture with Effect services             | Accepted                              |
| [0004](0004-persistence-with-effect-sql-on-postgresql.md)               | Persistence with effect/sql on PostgreSQL               | Accepted                              |
| [0005](0005-rest-apis-with-effect-httpapi-and-generated-openapi.md)     | REST APIs with Effect HttpApi and generated OpenAPI     | Accepted                              |
| [0006](0006-one-inbound-port-per-resource.md)                           | One inbound port per resource                           | Accepted                              |
| [0007](0007-nx-monorepo-with-one-package-per-layer.md)                  | Nx monorepo with one package per layer                  | Accepted                              |
| [0008](0008-react-and-vite-web-apps-with-the-typed-api-client.md)       | React and Vite web apps with the typed API client       | Accepted (amended by ADRs 0009, 0011) |
| [0009](0009-design-system-with-dtcg-tokens-and-a-css-modules-ui-kit.md) | Design system with DTCG tokens and a CSS Modules UI kit | Accepted (amended by ADR 0014)        |
| [0010](0010-observability-with-effects-otlp-exporter.md)                | Observability with Effect's OTLP exporter               | Accepted                              |
| [0011](0011-tanstack-router-and-query-for-web-apps.md)                  | TanStack Router and Query for web apps                  | Accepted                              |
| [0012](0012-an-agent-runtime-port-with-a-pi-adapter.md)                 | An agent runtime port with a Pi adapter                 | Accepted                              |
| [0013](0013-adopt-the-shared-ci-package-and-a-single-job-gate.md)       | Adopt the shared CI package and a single-job gate       | Accepted                              |
| [0014](0014-adopt-the-shared-design-package.md)                         | Adopt the shared design package                         | Accepted                              |
