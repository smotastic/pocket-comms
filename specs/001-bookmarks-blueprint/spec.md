# Spec 001 — Bookmarks blueprint

- **Status:** `Done` — approved by the human owner on 2026-10-19

## 1. Problem / intent (WHY)

ADRs 0002 to 0008 decide the stack (Effect, hexagonal layers, PostgreSQL, `HttpApi`, Nx, React),
but decisions alone do not show the pieces working together. Agents and people need one runnable
fullstack reference that they copy when they build a real service, and that CI keeps correct.

The blueprint manages bookmarks. The resource carries no business meaning; it exists to show each
technical capability once: value objects, typed errors, a lifecycle rule, a unique constraint,
optimistic concurrency, paging, persistence with migrations, a published API contract and a web
app that uses it.

## 2. Scope

- **In scope:**
  - The API server, its layer packages and its contract in `blueprints/bookmarks/`.
  - Create, get, list, update, archive and delete bookmarks.
  - An in-memory and a PostgreSQL repository with migrations.
  - Health endpoints and local operation with PostgreSQL in Docker Compose.
  - A React + Vite web app that lists, creates, archives and deletes bookmarks.
- **Out of scope:** authentication and authorization, events and messaging, deployment, restoring
  an archived bookmark, full-text search.

## 3. Requirements (WHAT)

### Bookmark

1. A bookmark has an id, a URL, a title, tags, a status (`active` or `archived`), a version, a
   creation time and a last-change time.
2. The URL is an absolute `http` or `https` URL of at most 2,048 characters.
3. The title has 1 to 200 characters after trimming white space.
4. A tag is lowercase kebab-case with 1 to 30 characters. Tags of one bookmark are unique, at
   most 10 per bookmark.
5. A URL belongs to at most one bookmark, whatever its status.
6. The version starts at 1 and increases by 1 with every change.
7. An archived bookmark cannot be updated. It can still be read, listed and deleted.

### API

8. The server exposes under `/api/v1`:
   - `POST /bookmarks` — create; `201` with a `Location` header.
   - `GET /bookmarks/{id}` — get one.
   - `GET /bookmarks` — list newest first; filter by `tag` and `status` (`active` by default,
     `archived`, `all`); page with an opaque `cursor` and a `limit` (default 20, maximum 100).
   - `PATCH /bookmarks/{id}` — change URL, title or tags.
   - `POST /bookmarks/{id}/archive` — archive; archiving again returns it unchanged.
   - `DELETE /bookmarks/{id}` — delete; `204`.
9. Every response with one bookmark carries its version as an `ETag`. `PATCH` requires
   `If-Match`; archive and delete accept an optional one. A stale `If-Match` fails.
10. Every error is an RFC 9457 Problem Details document (`application/problem+json`):

    | Case                                          | Status |
    | --------------------------------------------- | ------ |
    | Unknown bookmark id                           | `404`  |
    | URL already used by another bookmark          | `409`  |
    | Update of an archived bookmark                | `409`  |
    | `If-Match` does not match the current version | `412`  |
    | `PATCH` without `If-Match`                    | `428`  |
    | Invalid input, including too many tags        | `422`  |

    A `422` names every failed field.

### Persistence and operation

11. Schema changes are migrations that run as a separate step before the server starts. Running
    the step twice changes nothing the second time.
12. The server can run with an in-memory store for tests.
13. `GET /health/live` returns `200` while the process runs; `GET /health/ready` returns `200`
    while the database answers and `503` otherwise.
14. The server serves its OpenAPI document and a browser UI at `/docs`, and commits the document
    at `apps/server/api/openapi.json`.

### Web app

15. The web app lists active bookmarks, creates a bookmark, archives and deletes one, and shows
    the `title` and field errors of a Problem Details response.
16. The web app calls the API only through the typed client derived from the contract package.

## 4. Acceptance criteria

- Given a valid URL, title and two tags, When a client creates a bookmark, Then the response is
  `201` with version 1, an `ETag` and a `Location`.
- Given a bookmark with a URL, When another bookmark with the same URL is created, Then the
  response is a `409` problem.
- Given 11 tags, When a client creates a bookmark, Then the response is a `422` problem naming
  `tags`.
- Given a bookmark at version 2, When a client patches it with `If-Match` for version 1, Then the
  response is `412` and nothing changes; without `If-Match`, the response is `428`.
- Given an archived bookmark, When a client patches it, Then the response is a `409` problem.
- Given 25 bookmarks, 5 with tag `docs`, When a client lists with `tag=docs`, Then it receives
  those 5 newest first; with `limit=10` it receives 10 and a cursor to the next 10.
- Given an unknown id, When a client gets, patches, archives or deletes it, Then the response is a
  `404` problem.
- Given a running server, When PostgreSQL stops, Then `/health/ready` returns `503` and
  `/health/live` still returns `200`.
- Given a changed request schema, When the committed OpenAPI document is not regenerated, Then CI
  fails.

## 5. Notes

- **Bookmark** is the only aggregate. `BookmarkId`, `BookmarkUrl`, `Title`, `Tag` and `Version`
  are value objects. The tag limit is the domain constant `MAX_TAGS = 10`.
- Delete is final.
- The blueprint has no users. It must not be exposed outside a developer machine or CI.
