# Plan 001 — Bookmarks blueprint

- **Spec:** [spec.md](./spec.md)
- **Status:** `Done` — approved by the human owner on 2026-10-19

## 1. Affected projects

All paths are relative to `blueprints/bookmarks/`.

| Path                      | Change                                                                 | Nx tags                                   |
| ------------------------- | ---------------------------------------------------------------------- | ----------------------------------------- |
| `packages/contract`       | The `BookmarksApi` `HttpApi`, its wire schemas and errors              | `scope:contracts`                         |
| `packages/domain`         | `Bookmark`, value objects, `MAX_TAGS`, domain errors                   | `scope:bookmarks`, `layer:domain`         |
| `packages/application`    | `BookmarksInbound`, outbound ports, one file per use case, DTOs        | `scope:bookmarks`, `layer:application`    |
| `packages/infrastructure` | SQL and in-memory repositories, UUIDv7 ids, rows, migrations, migrator | `scope:bookmarks`, `layer:infrastructure` |
| `packages/api`            | Handlers, Problem Details mapping, health routes, OpenAPI, acceptance  | `scope:bookmarks`, `layer:infrastructure` |
| `apps/server`             | Composition root: `main.ts`, `migrate.ts`, `openapi.ts`                | `scope:bookmarks`, `type:app`             |
| `apps/web`                | React + Vite SPA using `HttpApiClient` from the contract               | `scope:bookmarks`, `type:web`             |

Shared: `packages/backend-shared` (`FieldIssue`, Problem Details helpers, validation middleware)
and `packages/contracts/problem-details` at the repository root.

## 2. Contract changes

New: `BookmarksApi` at `/api/v1`, committed at `apps/server/api/openapi.json`.

## 3. Migrations

`0001_create_bookmarks`: table `bookmarks.bookmarks` with a unique key on `url` and indexes for
the newest-first order and the tag filter. Approved by the human owner.

## 4. Test strategy

- Unit: domain rules and each use case against the fakes in `application/src/testing`.
- Repository: one contract suite runs against the in-memory and the SQL adapter (Testcontainers).
- API: an acceptance suite in `packages/api/src/testing` drives the server through the typed
  client; `apps/server` runs it and a runtime test on PostgreSQL.
- Web: component tests with a mocked client.
- Boundaries: `pnpm dep-cruise`, `pnpm test:boundaries`, `pnpm ports:check`, the OpenAPI gates.

## 5. Risks

Effect 4 is a release candidate (ADR 0002).
