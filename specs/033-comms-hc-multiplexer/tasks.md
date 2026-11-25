# Tasks 033 — pocket-comms: run the agents in herdr-core (hc)

- **Plan:** [plan.md](./plan.md)

Each task is small and independently testable, a vertical slice where possible. Tick its checkbox
in the task's own commit.

- [x] **T01** — Domain: `Multiplexer` (`herdr`, `hc`) with its display name, and `statusOf`, the
      OSC 7501 status mapping (`error` as `blocked`, no record as `unknown`). Glossary:
      **multiplexer**, and the **agent** entry no longer names a pane.
  - Gate: `pnpm nx run comms-domain:test`

- [x] **T02** — The overview state names the multiplexer: `MultiplexerOutbound.multiplexer`, the
      Herdr adapter reports `herdr`, `OverviewState` gets `multiplexer` on both variants, the API
      passes it on, the OpenAPI document is regenerated.
  - Gate: `pnpm nx run-many -t test -p comms-domain comms-application comms-api comms-server` and
    `pnpm nx run comms-server:openapi` leaves no diff

- [x] **T03** — Web: "… is not running", **New task** and **Close** name the overview's
      multiplexer instead of Herdr.
  - Gate: `pnpm nx run comms-web:test`

- [x] **T04** — hc adapter, reading: socket client (`hello` generation check, JSON-RPC errors as
      rejected or unavailable), `snapshot` (which terminals are agents, their fields, workspaces
      and grouping through git), `readScreen`, `readAgent`, `changes` from `events.subscribe` and a
      relist; a scripted fake hc server.
  - Gate: `pnpm nx run comms-infrastructure:test -- src/hc`

- [x] **T05** — hc adapter, acting: `openWorktree` and `openShell` (labelled shell terminals),
      `startAgent` (argv, labels, name, `keep`, `no_parent`, then the given shell ends),
      `prompt` (`terminal.send`, never `force`), `closeWorkspace` (kill, then remove each).
  - Gate: `pnpm nx run comms-infrastructure:test -- src/hc`

- [x] **T06** — hc adapter, raw input: `typeText` and `sendKeys` as DATA frames through
      `terminal.attach` at the terminal's own size, one key per write `keyGap` apart, then CLOSE.
  - Gate: `pnpm nx run comms-infrastructure:test -- src/hc`

- [ ] **T07** — Shared port cases: the Herdr and hc adapter tests run one set of cases for what
      the application relies on, each against its own fake.
  - Gate: `pnpm nx run comms-infrastructure:test`

- [x] **T08** — Server: `COMMS_MULTIPLEXER` (`herdr` default, `hc`, any other value stops the
      start with the allowed values) and `HC_SOCKET`; the composition picks the adapter; README.
  - Gate: `pnpm nx run comms-server:test`

- [ ] **T09** — Sessions and skills in hc: the Claude hook labels its hc terminal with
      `comms.session` on `SessionStart` (never fails, never prints); a Pi extension does the same;
      the attach skill reads `HC_TERMINAL_ID` when `HERDR_PANE_ID` is not set; AGENTS.md rules and
      set-up.
  - Gate: `pnpm nx run comms-server:test`

- [ ] **T10** — Live check: a dev server with `COMMS_MULTIPLEXER=hc` starts a Claude task, shows
      it under its project, answers a question, shows its conversation and closes it; `pnpm
    verify:local`.
  - Gate: the live check's notes in the pull request
