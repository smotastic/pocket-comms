# Tasks 003 — OpenTelemetry observability for backend services

- **Plan:** [plan.md](./plan.md)

Each task is small and independently testable, a vertical slice where possible. Tick its checkbox
in the task's own commit.

- [x] **T01** — `@pocket-comms/backend-shared/observability` with `Observability.layer({ serviceName })`:
      empty without `OTEL_EXPORTER_OTLP_ENDPOINT`, OTLP/HTTP export of all three signals with it,
      `OTEL_SERVICE_NAME` override; plus the recording test kit (tracer, logger, `HttpClient`)
  - Gate: `pnpm nx test backend-shared`

- [x] **T02** — Import rule: only server composition roots may import
      `packages/backend-shared/src/observability`, with a boundary fixture
  - Gate: `pnpm dep-cruise`, `pnpm test:boundaries`

- [x] **T03** — Per-signal endpoints: `OTEL_EXPORTER_OTLP_<SIGNAL>_ENDPOINT` switches on one
      signal at its URL as given, `OTEL_EXPORTER_OTLP_ENDPOINT` is the base for the rest; the
      serialization is one Prometheus's OTLP receiver accepts
  - Gate: `pnpm nx test backend-shared`

- [x] **T04** — Bookmarks server provides the layer as `bookmarks-server`; acceptance tests for the
      span tree of a create, `traceparent` propagation, the `409` error semantics with the log
      record's trace id, and an unreachable endpoint
  - Gate: `pnpm nx test bookmarks-server`

- [x] **T05** — No spans for `/health/live` and `/health/ready`; `authorization`, `cookie` and
      `set-cookie` redacted from span attributes
  - Gate: `pnpm nx test backend-shared`, `pnpm nx test bookmarks-server`

- [x] **T06** — Request duration histogram `http.server.request.duration` by method, route pattern
      and status code, health checks included, wired by `Observability.serve`
  - Gate: `pnpm nx test backend-shared`, `pnpm nx test bookmarks-server`

- [x] **T07** — PostgreSQL runtime test asserts a `sql.execute` span under
      `BookmarkRepository.insert`
  - Gate: `pnpm nx test bookmarks-server`

- [x] **T08** — Docs: an as-built note on ADR 0010 (`Observability.serve`); observability section in `blueprints/bookmarks/AGENTS.md` (the one line,
      the environment variables, pocket-cloud#3) and span, log and metric guidance in the `effect`
      skill
  - Gate: `pnpm verify:local`
