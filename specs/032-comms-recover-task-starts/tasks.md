# Tasks 032 — pocket-comms: recover a task start that stopped before the first prompt

- **Plan:** [plan.md](./plan.md)

Each task is small and independently testable, a vertical slice where possible. Tick its checkbox
in the task's own commit.

- [x] **T01** — Check Herdr 0.9.5's `tab.create` and `worktree.open` live in an isolated session
      and note their request and answer shapes in the plan
  - Gate: the shapes are in plan section 4; a mismatch is raised with the owner

- [x] **T02** — Domain: `TaskStart`, `Delivery`, `deliveryOf`, `afterRestart`, `startFor`,
      `recoveryOf`
  - Gate: `pnpm nx test comms-domain`

- [x] **T03** — The starts file: `TaskStartsStoreOutbound`, the file store and the fake
  - Gate: `pnpm nx run-many -t test,test-typecheck -p comms-application comms-infrastructure`

- [x] **T04** — `HerdrOutbound.openShell` and `openWorktree` in the port, the socket adapter and
      the fake
  - Gate: `pnpm nx run-many -t test,test-typecheck -p comms-application comms-infrastructure`

- [x] **T05** — `makeCreateTask` keeps the start at each step and forgets it on delivery; `close`
      forgets it
  - Gate: `pnpm nx test comms-application`

- [x] **T06** — `TaskStartsInbound`: `forAgent` (kept or rebuilt from the issue), `send`,
      `dismiss`, `startInWorktree`; the issues use case's `recovery` and forgetting starts whose
      worktree is gone
  - Gate: `pnpm nx test comms-application`

- [ ] **T07** — Contract, API and composition: the four endpoints, `IssueWork.recovery`, the
      problems, the wiring, the OpenAPI document and the accepted diff lines
  - Gate: `pnpm nx run-many -t test,test-typecheck,lint -p comms-contract comms-api comms-server`

- [ ] **T08** — Web: the client and queries; `TaskStartCard` in the conversation in place of the
      note
  - Gate: `pnpm nx run-many -t test,lint -p comms-web`

- [ ] **T09** — Web: Resume and Start an agent here on `IssueCard`, `StartAgentSheet`
  - Gate: `pnpm nx run-many -t test,lint -p comms-web`

- [ ] **T10** — Docs: `packages/comms/AGENTS.md`, the spec 021 note, `GLOSSARY.md`
  - Gate: `pnpm format:check`

- [ ] **T11** — The recovery check live against an isolated Herdr session, for Claude and Pi, with
      a server restart between the partial start and the recovery; the 390 px check of the card and
      the sheet
  - Gate: noted in the pull request
