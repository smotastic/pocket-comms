# ADR 0010 — Observability with Effect's OTLP exporter

- **Status:** Accepted
- **Date:** 2026-10-19
- **Related:** constitution principles 1, 6 and 10; ADRs 0002, 0003, 0004, 0005; spec 003

> **As-built note (2026-10-19).** A server's composition root calls
> `Observability.serve(appLayer, { serviceName })` in place of `HttpRouter.serve`; it provides
> `Observability.layer` and records `http.server.request.duration`. The route pattern comes from
> a route middleware, because Effect's router puts `http.route` on the server span only while
> spans are exported. Health checks are untraced by path.

> **Amendment (2026-10-19).** The shared backend is Grafana and Prometheus only, so it receives
> metrics only. Each signal is now switched on by its own standard variable
> (`OTEL_EXPORTER_OTLP_<SIGNAL>_ENDPOINT`), with `OTEL_EXPORTER_OTLP_ENDPOINT` as the base for the
> rest. The choice of exporter stands. Approved by the human owner with spec 003's amendment.

## TL;DR

Backend services export traces, metrics and logs over OTLP with the exporter built into Effect
(`effect/observability`), wired by one shared layer in `packages/backend-shared` and switched on
by `OTEL_EXPORTER_OTLP_ENDPOINT` alone. It needs no OpenTelemetry SDK, because every library we
trace is Effect already.

## Context

Servers log to stdout and nothing else. Effect already records spans for every `Effect.fn`, for
every HTTP request and for every SQL statement; they only need to leave the process. Data goes to
one shared Grafana stack (Tempo, Loki, Prometheus) in pocket-cloud, which is not part of this
repository. Without an endpoint, a server must behave exactly as before, and tests must need no
backend.

Out of scope: browser tracing, alerting, retention, a collector, sampling and OTLP
authentication.

## Options

| Criterion                                 | A: Effect's OTLP exporter (`effect/observability`) | B: `@effect/opentelemetry` + OpenTelemetry SDK    |
| ----------------------------------------- | -------------------------------------------------- | ------------------------------------------------- |
| Extra dependencies                        | ✅ none                                            | ❌ about eight `@opentelemetry/*` packages to pin |
| Covers Effect spans, logs, metrics        | ✅ all three, OTLP/HTTP JSON or protobuf           | ✅ all three                                      |
| Instrumentation of non-Effect libraries   | ❌ none                                            | ✅ via SDK auto-instrumentation                   |
| Samplers, processors, SDK ecosystem       | ⚠️ batching and retry only                         | ✅ full SDK                                       |
| API stability                             | ⚠️ marked unstable in an Effect release candidate  | ⚠️ follows the same Effect release candidate      |
| Configured by standard `OTEL_*` variables | ✅ endpoint, service name, resource attributes     | ✅                                                |

Legend: ✅ good · ⚠️ caveat · ❌ bad

## Decision

We will use option A.

- `@pocket-comms/backend-shared/observability` exports `Observability.layer({ serviceName })`. Each
  server's composition root provides it once. Only composition roots may import it
  (dependency-cruiser); other layers keep using `Effect.fn` and `Effect.log*` only.
- `OTEL_EXPORTER_OTLP_ENDPOINT` switches on all three signals. When it is unset, the layer is
  empty: no exporter, no connection. `OTEL_SERVICE_NAME` overrides the name in code;
  `OTEL_RESOURCE_ATTRIBUTES` carries version and environment.
- We do not use Effect's `layerFromConfig`, which also requires an `OTEL_<SIGNAL>_EXPORTER`
  variable per signal and fails without `OTEL_SERVICE_NAME`.
- HTTP metrics come from one histogram, `http.server.request.duration`, by method, route pattern
  and status code, following the OpenTelemetry HTTP conventions. So do span error statuses: only
  `5xx` marks the server span as an error.
- Health endpoints produce no spans. `authorization`, `cookie` and `set-cookie` are always
  redacted from span attributes.

## Consequences

- **Positive:** no new dependency; one line per service; standard variable names, so any OTLP
  backend works; tests run without a backend.
- **Negative / trade-offs:** non-Effect libraries are not traced; no sampling, so every request is
  exported; the exporter API is unstable until Effect 4 is final and may need a change in the one
  shared module.
- **Follow-ups:** the stack in pocket-cloud (smotastic/pocket-cloud#3); revisit option B if a
  non-Effect library needs tracing or sampling becomes necessary; browser tracing later.
