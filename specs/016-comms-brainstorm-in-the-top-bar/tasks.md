# Tasks 016 — pocket-comms: open the brainstorm chat from the top bar

- **Plan:** [plan.md](./plan.md)

Each task is small and independently testable, a vertical slice where possible. Tick its checkbox
in the task's own commit.

## Web app

- [x] **T01** — `Brainstorm` becomes a provider at the root with `useOpenBrainstorm` and
      `BrainstormAction`; no floating bubble; Brainstorm before Projects on the overview; the
      existing chat tests open the chat from the overview
  - Gate: `pnpm nx test comms-web`

- [x] **T02** — Brainstorm before New task on the project page, also for a name that is not a
      project
  - Gate: `pnpm nx test comms-web`

- [x] **T03** — `ConversationMenu`: More in the conversation's top bar on every header state, with
      Brainstorm with Pi and, for a closable agent, Close &lt;agent&gt;; each entry closes More
      first; the close tests go through More
  - Gate: `pnpm nx test comms-web`

- [ ] **T04** — A conversation's composer draft survives opening and closing the brainstorm chat
  - Gate: `pnpm nx test comms-web`

## Wrap-up

- [ ] **T05** — Docs that describe the bubble; the top bars checked at 390 px; spec, plan status
      `Done`
  - Gate: `pnpm verify:local`
