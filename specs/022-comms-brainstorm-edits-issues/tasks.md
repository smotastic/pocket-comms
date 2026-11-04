# Tasks 022 — pocket-comms: the brainstorm chat edits existing issues

- **Plan:** [plan.md](./plan.md)

Each task is small and independently testable, a vertical slice where possible. Tick its checkbox
in the task's own commit.

- [x] **T01** — Domain: the issue and edit proposals by `kind`, remembered reads, `parseIssueEdit`
      and `baseChanged`
  - Gate: `pnpm nx test comms-domain`

- [x] **T02** — Gitea: `GiteaOutbound.updateIssue` and the adapter's `PATCH` of title and body
  - Gate: `pnpm nx test comms-infrastructure`

- [x] **T03** — Application and storage: `read_issue`, `propose_issue_edit`, the reads in the
      chat and its file (version 2, version 1 still loads), `decide` with `Apply`,
      `IssueChangedError`, the instructions
  - Gate: `pnpm nx run-many -t test,typecheck -p comms-application comms-infrastructure`

- [x] **T04** — Contract and API: the edit proposal entry, the `Apply` decision, the
      `issue-changed` problem, the OpenAPI document
  - Gate: `pnpm nx run-many -t test -p comms-contract comms-api comms-server`

- [ ] **T05** — Web: `IssueEditCard` in the design system and the brainstorm sheet shows it
  - Gate: `pnpm nx run-many -t test -p design-ui comms-web`

- [ ] **T06** — Docs: the comms service guide; the spec's status `Done`
  - Gate: `pnpm verify:local`
