# Spec 003 — OpenTelemetry observability for backend services

- **Status:** `Done` — approved by the human owner on 2026-10-19, amendment re-approved the same day
- **Issue:** Gitea #4. The observability stack is smotastic/pocket-cloud#3.

## 1. Problem / intent (WHY)

A server has no observability beyond log lines on stdout. When a request is slow or fails,
especially once an app runs on the homelab, nobody can see what it did: which use case ran, how
long the SQL took, where an error came from.

Effect already records a span for every `Effect.fn('…')`, and every use case and repository
method has one. Each service should be able to export these spans, a few request metrics and its
logs over OTLP, each signal to wherever a backend for it exists, and a new service should get this with one line in its
composition root.

## 2. Scope

- **In scope:**
  - Export of traces, metrics and logs over OTLP from every backend server, configured only by
    environment variables.
  - HTTP server spans linked to the existing use-case, repository and SQL spans.
  - One HTTP request duration metric.
  - Trace context on exported log records.
  - Shared wiring that every service uses, and its use in the bookmarks blueprint server.
  - An ADR on the observability approach, and docs for how a new service gets observability
    (blueprint `AGENTS.md`, `effect` skill).
- **Out of scope:**
  - The observability backend itself. The shared one in pocket-cloud (smotastic/pocket-cloud#3)
    is Grafana and Prometheus, so it receives metrics only. This repository ships no stack, no
    compose file for it and no local setup on the dev machine.
  - Telemetry for one-off processes: migrations and the OpenAPI generator.
  - Browser tracing in the web apps.
  - Alerting and production-grade retention.
  - An OpenTelemetry Collector, sampling configuration and OTLP authentication headers.
  - A changed stdout log format, such as JSON.
  - Business metrics, such as bookmarks created.

## 3. Requirements (WHAT)

### Configuration

1. Each signal is switched on by its own standard endpoint variable and exported over OTLP/HTTP
   to that URL as given: `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`, `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`,
   `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT`. `OTEL_EXPORTER_OTLP_ENDPOINT` is the base for every signal
   without its own variable, with `/v1/traces`, `/v1/metrics` or `/v1/logs` appended. A signal
   with neither is not exported. No other variable is needed.
2. Without any of these variables, a server behaves exactly as before: it exports nothing, opens
   no connection to an exporter and logs no telemetry errors.
3. Each service names itself in code (for example `bookmarks-server`). `OTEL_SERVICE_NAME`
   overrides that name.
4. `OTEL_RESOURCE_ATTRIBUTES` adds resource attributes such as `service.version` and
   `deployment.environment.name`; the deployment sets them, not the code.
5. A collector that is unreachable or slow never fails or slows a request; the server keeps
   serving.

### Traces

6. Every HTTP request gets a server span, the parent of the use-case span, which is the parent of
   the repository spans, which are the parents of the SQL query spans.
7. The server span carries the method, the route pattern, the response status code and the
   duration.
8. An incoming W3C `traceparent` header makes the server span a child of the caller's trace.
9. Requests to `/health/live` and `/health/ready` produce no spans.
10. The values of the `authorization`, `cookie` and `set-cookie` headers never appear on a span.
11. Spans follow the OpenTelemetry HTTP conventions for errors: a `5xx` response marks the server
    span as an error, a `4xx` response does not. A use case that fails with a typed error (such
    as a conflict) marks its own span as an error with that error.

### Metrics

12. Every HTTP request, including health checks, is recorded in one histogram
    `http.server.request.duration` in seconds, with the attributes `http.request.method`,
    `http.route` (the route pattern, never the raw path) and `http.response.status_code`.
    Request count, latency per route and error rate are derived from it.

### Logs

13. Every log record exported over OTLP carries the trace id and span id of the span it was
    written in, so a log line leads to its trace.
14. Logs keep going to stdout in today's format, whether telemetry is on or off.

### Reuse

15. A service turns observability on with one call from `packages/backend-shared` in its
    composition root, `Observability.serve` in place of `HttpRouter.serve`. Only server composition roots (`apps/server`, `apps/<service>-server`) may import it; domain,
    application and infrastructure code stay free of telemetry wiring and only use `Effect.fn`
    and `Effect.log*`.
16. Tests need no observability backend.

## 4. Acceptance criteria

These are proven by automated tests. The request duration metric is checked in Grafana as part
of smotastic/pocket-cloud#3, once the backend and the bookmarks deployment exist. That backend
has no trace or log store, so traces and logs are proven by these tests only.

- Given a server with a recording tracer, When a client creates a bookmark, Then one trace
  contains the HTTP server span for `POST /api/v1/bookmarks`, the `CreateBookmark.create` span
  and the `BookmarkRepository.insert` span, as parent and children, each with a duration.
- Given a bookmark with a URL, When a client creates another with the same URL, Then the response
  is `409`, the `CreateBookmark.create` span is marked as an error with the conflict, the server
  span carries status code `409` and is not an error, and a log record of that request carries
  the same trace id.
- Given a request with a `traceparent` header, When the server handles it, Then the server span
  belongs to that trace.
- Given a request to `/health/live`, When the server handles it, Then no span is recorded, and
  the duration histogram counts it.
- Given a request with an `authorization` header, When the server handles it, Then no span
  carries its value.
- Given a server with a recording metric exporter, When clients send requests to two routes, Then
  `http.server.request.duration` has one series per method, route pattern and status code.
- Given only `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`, When the server serves requests, Then it
  exports metrics to exactly that URL and no traces or logs.
- Given none of the endpoint variables, When the server starts and serves requests, Then it
  makes no exporter connection and logs no telemetry errors.
- Given `OTEL_EXPORTER_OTLP_ENDPOINT` pointing at an unreachable address, When a client sends
  requests, Then they succeed as without telemetry.
- Given the existing test suites, When they run, Then they pass with no observability backend.

## 5. Notes

- The ADR records the choice of exporter and its trade-offs; the plan says how the layer is
  built. Both are reviewed together with this spec.
- The resource attributes `service.name`, `service.version` and `deployment.environment.name`
  are on every signal; pocket-cloud promotes them to Prometheus labels.
- **Amendment (2026-10-19).** The shared backend became Grafana and Prometheus only, whose OTLP
  receiver takes metrics only (OTLP/HTTP, `/api/v1/otlp/v1/metrics`). One base endpoint for all
  three signals would send traces and logs to paths that answer `404`, so each signal now has
  its own switch. Trace and log export stay, off until a backend for them exists.
- **Decision (2026-10-19, human owner).** Effect's tracing and a route-aware middleware attach at
  different points of `HttpRouter.serve`, so requirement 15 is one call, `Observability.serve`,
  instead of one layer.
