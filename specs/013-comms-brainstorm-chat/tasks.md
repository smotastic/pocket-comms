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

- [x] **T06** — Web: the bubble on every screen and the brainstorm sheet
  - Gate: `pnpm nx test comms-web`, `pnpm verify:local`

- [x] **T07** — Docs: the service's `AGENTS.md` rules, the README settings, spec status `Done`
  - Gate: `pnpm verify:local`

## Follow-ups from the code review

- [ ] **F01** — A Create that times out after Gitea created the issue leaves the card open, and a
      retry files a duplicate; a failed save after the `POST` reopens the card after a restart.
      Look for an open issue with the same title before creating, or say so on the card.
- [ ] **F02** — A failed turn keeps the owner's message but not Pi's history, so Pi forgets it, and
      a decision note given in a failed turn. Store the turn's input in Pi's history before it runs.
- [ ] **F03** — `readDoc` reads the whole file before it is cut; read at most `MAX_DOC_LENGTH`.
