# ADR 0011 — TanStack Router and Query for web apps

- **Status:** Accepted
- **Date:** 2026-10-30
- **Related:** constitution principle 3; ADRs 0005, 0007, 0008, 0009

## TL;DR

We will route web apps with TanStack Router, from route files that its Vite plugin turns into a
generated route tree, and hold server data in TanStack Query. Query and mutation functions call
the typed Effect client of ADR 0008, so contract types reach the UI unchanged and that client
stays the only way to call an API.

## Context

ADR 0008 gives web apps React, Vite and the typed `HttpApiClient`, but no routing and no shared
way to load, cache and refresh server data. The bookmarks app reloads its list by hand after each
change. pocket-learning and pocket-galaxy already route with TanStack Router; the next app,
pocket-comms, shows live agent data and needs caching and invalidation. Without a decision, each
app picks its own router and data layer, and agents copy whichever app they read first.

In scope: client-side routing and server-data state in web apps. Out of scope: server-side
rendering (ADR 0008 still excludes it) and the look of the app (ADR 0009).

## Decision

- **Routing.** We will use `@tanstack/react-router` with file-based routes. `tanstackRouter()` from
  `@tanstack/router-plugin/vite` runs before the React plugin and writes `src/routeTree.gen.ts`
  from `src/routes/`, as `tsr.config.json` configures. The generated tree is committed; the
  `routes-check` target, which `lint` depends on, fails when it is stale. Prettier and ESLint
  ignore it.
- **Router context.** `src/router.ts` exports `createAppRouter({ client, history? })`. The app's
  typed client reaches every route through the router context; `main.tsx` passes the real client
  and the browser history, tests pass a fake client and a memory history.
- **Server data.** We will use `@tanstack/react-query`. Each query is a `queryOptions` factory
  next to its query key; its `queryFn` calls the typed client. Mutations call the typed client and
  invalidate every query key the change affects. `main.tsx` mounts the router inside one
  `QueryClientProvider`.
- **API access.** The typed client of ADR 0008 stays the only way to call an API. Query code never
  calls `fetch` and never builds a second client.
- **Versions.** The four TanStack packages come from the pnpm catalog.

TanStack Router is what the owner's other apps already use, so this keeps one pattern across
projects. TanStack Query adds the cache and invalidation that live data needs, and it takes plain
promise functions, so the typed client plugs in without an adapter.

## Consequences

- **Positive:** routes are files an agent can find by address; the route tree is typed, so a link
  to a missing route fails the build; a mutation refreshes stale data with one line; contract
  types flow unchanged from the client through the cache to the UI.
- **Negative / trade-offs:** four more dependencies and a generated file; tests must render
  through the router and a `QueryClientProvider` (`src/testing.tsx` in the bookmarks web app does
  both); an unknown address now shows the router's not-found page.
- **Follow-ups:** none. The bookmarks web app (`blueprints/bookmarks/apps/web`) is the reference.
