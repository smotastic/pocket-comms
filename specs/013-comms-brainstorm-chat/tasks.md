# Tasks 013 — pocket-comms: a floating brainstorm chat

- **Plan:** [plan.md](./plan.md)

Each task is small and independently testable. Tick its checkbox in the task's own commit.

- [x] **T01** — Domain: brainstorm entries, proposals, decisions and the issue draft rules
  - Gate: `pnpm nx test comms-domain`

- [x] **T02** — Application: the runtime, store, Gitea and projects port changes, the brainstorm
      tools, the turn runner and `BrainstormInbound`, with fakes
  - Gate: `pnpm nx test comms-application`

- [x] **T03** — Infrastructure: Pi's packages in the catalog, the dependency-cruiser rule, the Pi
      runtime and auth file, the file store, Gitea `createIssue` and git `readDoc`
  - Gate: `pnpm nx test comms-infrastructure`, `pnpm nx run-many -t lint`

- [x] **T04** — Contract, API and server: the `brainstorm` group, its handlers and problems, the
      settings, the composition and the OpenAPI document
  - Gate: `pnpm nx run-many -t test -p 'comms-*'`, `pnpm openapi:check`

- [x] **T05** — Design kit: the `brainstorm` icon, `FloatingButton` and `ProposalCard`
  - Gate: `pnpm nx run-many -t lint test -p design-ui`

- [ ] **T06** — Web: the bubble on every screen and the brainstorm sheet
  - Gate: `pnpm nx test comms-web`, `pnpm verify:local`

- [ ] **T07** — Docs: the service's `AGENTS.md` rules, the README settings, spec status `Done`
  - Gate: `pnpm verify:local`
