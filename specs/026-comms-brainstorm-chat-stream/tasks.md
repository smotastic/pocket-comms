# Tasks 026 — pocket-comms: the brainstorm reply streams in, with Pi's tools as they run

- **Plan:** [plan.md](./plan.md)

- [x] **T01** — Web: the design kit 0.11.1 and its link migration
  - Gate: `pnpm nx test comms-web`
- [x] **T02** — Domain, application and file store: the numbered log, the feed and the sink
  - Gate: `pnpm nx run-many -t test -p comms-domain comms-application comms-infrastructure`
- [x] **T03** — Contract, API and server: the events endpoint, the OpenAPI document
  - Gate: `pnpm nx run-many -t test -p comms-contract comms-api comms-server`
- [x] **T04** — Web: the sheet from the kit's agent parts, folded with `foldChat`
  - Gate: `pnpm verify:local`
