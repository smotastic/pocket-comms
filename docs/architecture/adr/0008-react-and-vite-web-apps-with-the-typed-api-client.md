# ADR 0008 — React and Vite web apps with the typed API client

- **Status:** Accepted (amended by ADRs 0009, 0011)
- **Date:** 2026-10-19
- **Related:** constitution principle 3; ADRs 0005, 0007

## TL;DR

We will build web apps as React single-page apps bundled with Vite. They call backend APIs only
through Effect's `HttpApiClient`, derived from the service's contract package, so the frontend is
typed end to end without code generation.

## Context

Projects often pair a backend with a small web UI. The UI must not drift from the API (principle
3), and the setup must fit the Nx workspace and Vitest.

## Options

| Criterion             | React + Vite SPA            | Next.js                         |
| --------------------- | --------------------------- | ------------------------------- |
| Fits Nx + Vitest      | ✅ native                   | ⚠️ own build and server         |
| Typed API calls       | ✅ `HttpApiClient` directly | ✅ same, plus server components |
| Concepts to learn     | ✅ few                      | ⚠️ routing, SSR, caching layers |
| Server-side rendering | ❌ none                     | ✅ built in                     |

## Decision

- **Stack.** React with Vite; tests with Vitest and Testing Library.
- **Location.** A web app lives in `apps/<name>` (or `blueprints/<name>/apps/web`) with the tags
  `scope:<service>` and `type:web`.
- **API access.** The app depends only on contract packages (`scope:contracts`). It builds its
  client with `HttpApiClient.make(<Service>Api, { baseUrl })` and runs the calls with Effect. It
  never imports domain, application or infrastructure code; the boundary rules enforce this.
- **Errors.** The app shows the `title` and field `errors` of Problem Details responses
  (ADR 0005).
- **Local development.** Vite proxies `/api` to the local server.

A project that needs server-side rendering writes a new ADR.

## Consequences

- **Positive:** one contract types server and UI; a breaking API change breaks the web build.
- **Negative / trade-offs:** Effect reaches the frontend bundle; no server-side rendering.
- **Follow-ups:** none.
