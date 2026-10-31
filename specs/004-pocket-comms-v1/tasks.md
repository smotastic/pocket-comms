# Tasks 004 — pocket-comms v1

- **Plan:** [plan.md](./plan.md)

Each task is small and independently testable, a vertical slice where possible. Tick its checkbox
in the task's own commit.

## Backend core

- [x] **T01** — Domain package: `AgentStatus`, `AgentKind`, `AgentKey`, `Prompt`, `Agent`,
      `Workspace`, `buildOverview` (repository groups, Needs you, seen completions, ordering)
  - Gate: `pnpm nx test comms-domain`, `pnpm dep-cruise`

- [x] **T02** — Domain: `TranscriptEntry` and `activityOf` (latest pending tool step or
      "Thinking…")
  - Gate: `pnpm nx test comms-domain`

- [x] **T03** — Application package: ports `HerdrOutbound`, `TranscriptOutbound`, `SeenOutbound`,
      `StatusHistoryOutbound`, DTOs, errors and fakes; `AgentsInbound` with `overview`, `agent`,
      `markSeen`
  - Gate: `pnpm nx test comms-application`, `pnpm ports:check`

- [x] **T04** — Use cases `transcript`, `screen`, `prompt`, `sendKeys`, `overviewChanges`,
      `transcriptChanges`; the fake Herdr records calls and the tests prove no focus call exists
  - Gate: `pnpm nx test comms-application`

## Adapters

- [x] **T05** — `Herdr.layerSocket`: one request per connection, `result`/`error` decoding,
      unreachable socket as `HerdrUnavailable`; `agent.list`, `workspace.list`, `agent.read`,
      `agent.prompt`, `agent.send_keys`
  - Gate: `pnpm nx test comms-infrastructure`

- [x] **T06** — `Herdr.layerSocket` `changes`: `events.subscribe` with per-pane status
      subscriptions, rebuilt when the pane set changes, plus a periodic re-list
  - Gate: `pnpm nx test comms-infrastructure`

- [x] **T07** — Claude transcript parser and path resolution, with anonymised fixtures
  - Gate: `pnpm nx test comms-infrastructure`

- [x] **T08** — Pi transcript parser and path resolution, with anonymised fixtures
  - Gate: `pnpm nx test comms-infrastructure`

- [x] **T09** — `Transcript.layerFiles` `read` (latest 300 entries, modification time) and
      `follow` (appended lines only); `Seen.layerMemory`, `StatusHistory.layerMemory`
  - Gate: `pnpm nx test comms-infrastructure`

## API and server

- [ ] **T10** — Contract `CommsApi`: agents, transcript, screen, prompt, keys, seen, and the two
      SSE streams, with descriptions and examples
  - Gate: `pnpm nx test comms-contract`

- [ ] **T11** — API handlers with Problem Details mapping, health routes, acceptance suite
  - Gate: `pnpm nx test comms-api`

- [ ] **T12** — Tailscale identity middleware (`COMMS_ALLOWED_LOGIN`, `@`-suffix rule) on every
      route
  - Gate: `pnpm nx test comms-api`

- [ ] **T13** — `apps/comms-server`: composition root on `127.0.0.1:${COMMS_PORT}`, `openapi`
      target and committed document, `dev` target, static web app route
  - Gate: `pnpm nx test comms-server`, `pnpm openapi:check`, `pnpm openapi:lint`

## Design kit

- [x] **T14** — Kit components `StatusPill`, `SectionHeader`, `AgentRow`, `TopBar`,
      `LiveIndicator`
  - Gate: `pnpm nx test design-ui`, `pnpm nx lint design-ui`

- [x] **T15** — Kit components `Segmented`, `UserMessage`, `ToolLine`, `KeyPad` (long-press key)
  - Gate: `pnpm nx test design-ui`

- [x] **T16** — Kit component `TerminalScreen`: ANSI SGR colours (16, 256, true colour), bold,
      dim, italic, underline, inverse; never interprets HTML
  - Gate: `pnpm nx test design-ui`

## Web app

- [ ] **T17** — `apps/comms-web` skeleton: client, queries, router, `renderApp`, dark theme,
      `dev` target with the header-adding proxy on `127.0.0.1`
  - Gate: `pnpm nx test comms-web`, `pnpm nx lint comms-web`

- [ ] **T18** — Overview route: groups, Needs you, rows, Herdr-unavailable state, live updates from
      `/api/v1/events`
  - Gate: `pnpm nx test comms-web`

- [ ] **T19** — Conversation route: header, chat entries, Activity, live entries, mark seen;
      other agent kinds open on the screen
  - Gate: `pnpm nx test comms-web`

- [ ] **T20** — Terminal view: Chat | Screen toggle, polled ANSI screen, key row
  - Gate: `pnpm nx test comms-web`

- [ ] **T21** — Input: composer sends prompts; approval panel with screen and keys replaces it while
      blocked; long-press Ctrl-C; errors keep the draft
  - Gate: `pnpm nx test comms-web`

- [ ] **T22** — Installable: manifest, icons, theme colour, `viewport-fit=cover`, safe areas
  - Gate: `pnpm nx test comms-web`, `pnpm nx build comms-web`

## Wrap-up

- [ ] **T23** — Remove the bookmarks blueprint and spec 001 with every follow-up of TEMPLATE.md
      step 3 (eslint scope, `tools/boundaries`, `tools/openapi`, CI images job, release workflow,
      `pnpm nx sync`)
  - Gate: `pnpm verify:local`, CI

- [ ] **T24** — README: what it is, `pnpm dev`, `pnpm start`, configuration, `tailscale serve`
      (HTTPS) instructions; root `AGENTS.md` and `TEMPLATE.md` updated
  - Gate: `pnpm format:check`

- [ ] **T25** — Smoke check against the real Herdr socket at 390 px with `agent-browser`; spec
      status `Done`
  - Gate: the check's screenshots and notes in the pull request
