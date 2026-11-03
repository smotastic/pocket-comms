# Tasks 019 — pocket-comms: show an agent's background work and its subagents

- **Plan:** [plan.md](./plan.md)

Each task is small and independently testable, a vertical slice where possible. Tick its checkbox
in the task's own commit.

- [x] **T01** — Domain: `background.ts` (kinds, items, `runningAt`), `needsYou` and
      `buildOverview` with the running count, `subagent` on the tool entry
  - Gate: `pnpm nx test comms-domain`

- [ ] **T02** — Infrastructure: the Claude parser tracks background work (shells, monitors,
      subagents, notifications, `TaskStop`/`KillShell`), sets `subagent` on `Agent` tool entries,
      and reads a subagent's own file; the anonymised fixtures
  - Gate: `pnpm nx test comms-infrastructure`

- [ ] **T03** — Smoke check: run the parser against real Claude sessions with a background shell, a
      monitor, a background and a foreground subagent; record in the plan what was seen,
      especially the foreground subagent's meta file and result
  - Gate: the plan's risk note says what was seen

- [ ] **T04** — Background on agents: `TranscriptOutbound.background` and the incremental read per
      session in the files adapter, the meta mapping, `AgentDto.background`, `needsYou` with the
      running count; `background` on the contract's `Agent`, `subagent` on its tool entry
  - Gate: `pnpm nx run-many -t test -p 'comms-*'`, `pnpm openapi:check`

- [ ] **T05** — Subagent conversations on the server: the subagent `TranscriptSource`,
      `SubagentsInbound` (read, events), `SubagentNotFoundError`, the two endpoints and their
      handlers, the OpenAPI document
  - Gate: `pnpm nx run-many -t test -p 'comms-*'`, `pnpm openapi:check`

- [ ] **T06** — Design kit: the `background` icon, the `AgentRow` marker, `BackgroundStrip`,
      `ToolLine` with `href` and `hint`, stories
  - Gate: `pnpm nx run-many -t lint test -p design-ui`

- [ ] **T07** — Web: the row marker on the overview and the project page, the strip in the
      conversation, the delegation links
  - Gate: `pnpm nx test comms-web`

- [ ] **T08** — Web: the subagent route, `SubagentConversation` and its live stream
  - Gate: `pnpm nx test comms-web`, `pnpm verify:local`

- [ ] **T09** — Docs: the service's `AGENTS.md` and README, spec status `Done` after the owner's
      check on the phone
  - Gate: `pnpm verify:local`
