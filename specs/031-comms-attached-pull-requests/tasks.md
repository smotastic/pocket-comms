# Tasks 031 — pocket-comms: pull requests attached to an agent, with their changes

- **Plan:** [plan.md](./plan.md)

Each task is small and independently testable, a vertical slice where possible. Tick its checkbox
in the task's own commit.

- [x] **T01** — Domain: `PullRequestRef`, `parsePullRequestPath`, `parseRepositoryName`,
      `attachTo`, `parseUnifiedDiff` with the per-file limit, `PullRequestState`
  - Gate: `pnpm nx test comms-domain`

- [x] **T02** — Gitea reads: `pullRequestOf`, `pullRequest`, `pullRequestDiff` (bounded) and
      `pullRequestFiles` in the port, the HTTP adapter (GET only) and the fakes
  - Gate: `pnpm nx run-many -t test,test-typecheck -p comms-application comms-infrastructure`

- [x] **T03** — The lists file: `PullRequestsStoreOutbound` and the file store
  - Gate: `pnpm nx run-many -t test,test-typecheck -p comms-application comms-infrastructure`

- [ ] **T04** — Use case: `PullRequestsInbound` (attach, list, remove, changes) and its errors
  - Gate: `pnpm nx test comms-application`

- [ ] **T05** — Contract, API and composition: the four endpoints, their problems, the wiring, the
      OpenAPI document and the accepted diff lines
  - Gate: `pnpm nx run-many -t test,test-typecheck,lint -p comms-contract comms-api comms-server`

- [ ] **T06** — The agent skill `comms-attach-pull-request`, copied into the server's `dist`
  - Gate: `pnpm nx run-many -t build -p comms-server`

- [ ] **T07** — Web: the client and queries; the pull requests in More with the count; remove
      (needs the kit 0.42.0 catalog bump)
  - Gate: `pnpm nx test comms-web`

- [ ] **T08** — Web: the changes sheet with `CodeDiff`, Refresh, Open in Gitea and the notices
  - Gate: `pnpm nx test comms-web`

- [ ] **T09** — Docs and live check: the service guide, the glossary, the skill set up on the
      owner's Mac; checked live at 390 px and on a wide screen; the spec's status `Done`
  - Gate: `pnpm verify:local`
