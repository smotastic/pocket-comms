# Tasks 001 — Bookmarks blueprint

- **Plan:** [plan.md](./plan.md)

- [x] **T01** — Contract package with `BookmarksApi` and the shared Problem Details schema
  - Gate: `pnpm nx test bookmarks-contract`

- [x] **T02** — Domain: `Bookmark`, value objects, `MAX_TAGS`, create, change and archive rules
  - Gate: `pnpm nx test bookmarks-domain`, `pnpm dep-cruise`

- [x] **T03** — Application: `BookmarksInbound`, outbound ports and the six use cases
  - Gate: `pnpm nx test bookmarks-application`, `pnpm ports:check`

- [x] **T04** — Infrastructure: in-memory and SQL repositories, migrations and the migrator
  - Gate: `pnpm nx test bookmarks-infrastructure`

- [x] **T05** — API: handlers, Problem Details mapping, health routes and the acceptance suite
  - Gate: `pnpm nx test bookmarks-api`

- [x] **T06** — Server: composition root, migration step, committed OpenAPI document
  - Gate: `pnpm nx test bookmarks-server`, `pnpm openapi:check`, `pnpm openapi:lint`

- [x] **T07** — Web app: list, create, archive and delete through the typed client
  - Gate: `pnpm nx test bookmarks-web`, `pnpm nx build bookmarks-web`

- [x] **T08** — Docker Compose for local PostgreSQL and the blueprint `AGENTS.md`
  - Gate: `pnpm verify:local`
