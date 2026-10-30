# Plan 003 — OpenTelemetry observability for backend services

- **Spec:** [spec.md](./spec.md)
- **Status:** `Done` — approved by the human owner on 2026-10-19, amendment re-approved the same day
- **ADR:** [0010 — Observability with Effect's OTLP exporter](../../docs/architecture/adr/0010-observability-with-effects-otlp-exporter.md)
  (`Accepted`)

## 1. Affected projects

| Path                               | Change                                                                                                                                                                                                     | Nx tags                       |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `packages/backend-shared`          | New subpath `@pocket-comms/backend-shared/observability`: `Observability.serve` and `Observability.layer`, the request duration middleware, the redacted header names and a recording test kit (`testing`) | `scope:shared`                |
| `blueprints/bookmarks/apps/server` | `composition.ts` serves with `Observability.serve(…, { serviceName: 'bookmarks-server' })`, used by `main.ts`; new `observability.spec.ts` with the acceptance tests                                       | `scope:bookmarks`, `type:app` |
| `.dependency-cruiser.cjs`          | New rule: only server apps (`apps/server`, `apps/<service>-server`, blueprint servers) may import `packages/backend-shared/src/observability`                                                              | —                             |
| `docs/architecture/adr/`           | ADR 0010 and the index line                                                                                                                                                                                | —                             |
| `blueprints/bookmarks/AGENTS.md`   | How a new service gets observability, and the environment variables                                                                                                                                        | —                             |
| `.agents/skills/effect/SKILL.md`   | Span, log and metric guidance: name spans with `Effect.fn`, log with `Effect.log*`, never wire telemetry outside the composition root                                                                      | —                             |

No new npm dependency. Everything comes from `effect/observability`, `effect/http` and `effect/Metric`
in the pinned `effect@4.0.0-rc.118`.

### How `Observability.layer` works

- Options: `{ serviceName: string }`, the default name for spec requirement 3.
- Resolves one endpoint per signal: `OTEL_EXPORTER_OTLP_<SIGNAL>_ENDPOINT` as given, else
  `OTEL_EXPORTER_OTLP_ENDPOINT` with `/v1/<signal>` appended, else none. This is the standard
  OTel rule, and the one Effect's own `OtlpEnv.endpoint` follows.
  - **No endpoint at all:** `Layer.empty`. No exporter, no HTTP client, no fibers
    (requirement 2).
  - **Otherwise:** `OtlpTracer.layer`, `OtlpMetrics.layer` and `OtlpLogger.layer` for the signals
    that have one, each with its URL and the same resource, merged and provided with the
    serialization and `FetchHttpClient.layer`. The homelab sets only the metrics endpoint
    (Prometheus `…/api/v1/otlp/v1/metrics`). JSON serialization, unless Prometheus's receiver
    accepts only protobuf; then `OtlpSerialization.layerProtobuf`, also built in. Metrics are
    cumulative, Effect's default and what Prometheus needs.
  - The name follows OpenTelemetry's order: `OTEL_SERVICE_NAME`, then `service.name` in
    `OTEL_RESOURCE_ATTRIBUTES`, then the in-code default; the layer resolves it itself, because
    Effect lets an explicit name win over both. Effect's `OtlpResource` merges the other
    `OTEL_RESOURCE_ATTRIBUTES` (requirements 3 and 4). The OTLP logger keeps the console logger
    (`mergeWithExisting` defaults to `true`, requirement 14).
- We do not use Effect's `layerFromConfig` variants: they export nothing unless
  `OTEL_<SIGNAL>_EXPORTER=otlp` is also set, and they die when `OTEL_SERVICE_NAME` is missing.
- The `HttpClient` is a layer requirement inside the module, so tests swap in a recording client.
- Always (on or off) it also provides `HttpMiddleware.TracerDisabledWhen` for the paths
  `/health/live` and `/health/ready`, whatever the query string (requirement 9).
  `authorization`, `cookie` and `set-cookie` are Effect's default redacted names; tests guard
  them (requirement 10).
- `Observability.serve(appLayer, options)` is `HttpRouter.serve` with the request duration
  (requirement 12) and the layer above provided. Every request is timed by a server middleware
  and recorded in `http.server.request.duration`, an Effect `Metric.histogram` in seconds with
  the OTel HTTP buckets (5 ms to 10 s), tagged with method, status code and, for a matched
  request, the route pattern. A route middleware provided to the app's routes reports the
  pattern from `HttpRouter.RouteContext`; the server span is no source, because the router sets
  `http.route` on it only when spans are exported, and the homelab exports metrics only.
- Traces: Effect creates the `http.server <method>` span (with `http.route`, status code and W3C
  `traceparent` propagation) and the `sql.execute` spans by itself. Nothing to add for
  requirements 6 to 8.
- Errors (requirement 11): the use-case `Effect.fn` span fails with the typed error by itself. The
  server span is marked as an error only for `5xx`; the task checks what Effect does for a `409`
  and adjusts the status in the middleware if it differs.
- Unreachable collector (requirement 5): Effect's exporter batches in the background (every 5 s)
  and retries 3 times; request fibers never wait for it. The test proves it.

## 2. Contract changes

None. No `HttpApi` change, the OpenAPI document stays the same.

## 3. Migrations

None.

## 4. Test strategy

- Unit (`packages/backend-shared`):
  - Only the metrics endpoint set: posts go to exactly that URL, none to traces or logs; a
    per-signal variable wins over the base.
  - `Observability.layer` without an endpoint builds `Layer.empty`: a recording `HttpClient` sees
    zero requests over a run of several requests plus an exporter interval.
  - With an endpoint, the recording `HttpClient` receives OTLP posts to `/v1/traces`,
    `/v1/metrics` and `/v1/logs`, with `service.name` from the option, and from
    `OTEL_SERVICE_NAME` when set (`ConfigProvider.fromMap`).
  - The duration middleware records one series per method, route pattern and status code, read
    with `Metric.snapshot`.
- Acceptance (`blueprints/bookmarks/apps/server/src/observability.spec.ts`), the server with the
  in-memory adapters and a recording tracer from the test kit:
  - create a bookmark: the span tree `http.server POST` → `CreateBookmark.create` →
    `BookmarkRepository.insert`;
  - duplicate URL: `409`, error on `CreateBookmark.create`, server span not an error, a log record
    in a recording logger with the same trace id;
  - `traceparent` header: the server span joins that trace;
  - `/health/live`: no span, one histogram count;
  - `authorization` header: its value on no span;
  - endpoint at an unreachable address: every request succeeds.
- SQL spans: the existing PostgreSQL `runtime.spec.ts` gets one assertion that a
  `BookmarkRepository.insert` span has a `sql.execute` child.
- Boundaries: `pnpm dep-cruise` proves the new rule with a fixture in `tools/boundaries`, as the
  other rules do.
- Existing suites stay unchanged and keep running without a backend (requirement 16).

## 5. Risks

- Prometheus's OTLP receiver may reject JSON. The task tries JSON against the documented content
  types and switches to protobuf if needed; both are built into Effect.

- `effect/observability` is marked `@stability unstable` in an Effect release candidate. A later
  Effect release may change its API. Mitigation: one module in `backend-shared` hides it, so a
  change touches one file (ADR 0010).
- The router may not expose the matched route pattern to a global middleware the way the plan
  assumes. Fallback: read `http.route` from the current server span's attributes. If neither
  works, the task stops and asks the human owner.
- Recording every request header on spans (Effect's default) can leak other sensitive headers
  added later. The redacted list lives in one place and the ADR names it.
