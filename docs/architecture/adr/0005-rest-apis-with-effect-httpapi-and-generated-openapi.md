# ADR 0005 — REST APIs with Effect HttpApi and generated OpenAPI

- **Status:** Accepted
- **Date:** 2026-10-19
- **Related:** constitution principles 3, 5, 10; ADRs 0002, 0003, 0008

## TL;DR

APIs are REST over HTTP, declared once with Effect `HttpApi` and Effect Schema in a contract
package. The server, the typed client and the OpenAPI 3.1 document all come from that one
declaration. Errors are RFC 9457 Problem Details, URLs carry a major version from `/api/v1`, and
each server commits its generated document so CI can prove it is current and compatible.

## Context

Contracts come first (principle 3). A hand-written client or document drifts from the server; a
generated one cannot. Clients need one error shape, not one per endpoint (principle 10).

**Scope:** synchronous HTTP APIs, their errors, versioning and published documents.

## Decision

- **Contract.** Each service declares its `HttpApi`, groups, endpoints and wire schemas in its
  contract package (`packages/<service>/contract`, `@pocket-comms/<service>-contract`). Servers implement it; web apps and other callers
  derive their client with `HttpApiClient` (ADR 0008). No hand-written client.
- **Implementation.** The service's `api` package implements the groups with `HttpApiBuilder`.
  Handlers map the wire type to the application DTO, call the inbound port and map back.
- **Errors.** Every error response is `application/problem+json` with `type`, `title`, `status`,
  optional `detail`, and named extensions (`errors` for validation failures). The shared schema
  lives in `@pocket-comms/contracts-problem-details`; the mapping helpers in `@pocket-comms/backend-shared`. A
  `type` is a stable URN, `urn:pocket-comms:problem:<slug>`. Request decoding failures are `422` problems
  naming every failed field.
- **Versioning.** URLs start with `/api/v1`. Compatible changes stay within a major version;
  breaking changes (removed or renamed operations or fields, new required input, narrowed input,
  changed types or status codes) need a new major version.
- **Concurrency.** Resources that change return their version as an `ETag`; changes take
  `If-Match`.
- **Published document.** Each server commits its canonical OpenAPI 3.1 document at
  `<app>/api/openapi.json` and serves it with a browser UI at `/docs`. Every operation, parameter
  and property has a description and an example.
- **Gates.** `pnpm openapi:check` fails on a stale document, `pnpm openapi:lint` on missing
  descriptions, examples or error responses, and `pnpm openapi:diff` on a breaking change against
  `master`. `pnpm test:openapi` proves each gate fires.

## Consequences

- **Positive:** server, client and document cannot drift; clients branch on stable problem types.
- **Negative / trade-offs:** wire schemas repeat the value-object rules so that one decoding pass
  names every failed field.
- **Follow-ups:** authentication and authorization get their own ADR when a project needs them.
