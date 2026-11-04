# Tasks 020 — pocket-comms: hold the done push while background work runs

- **Plan:** [plan.md](./plan.md)

Each task is small and independently testable, a vertical slice where possible. Tick its checkbox
in the task's own commit.

- [x] **T01** — Application: `makeBackgroundOf`, used by `agents.ts` in place of its own
      `backgroundOf`. As built it sits in `agents.ts` next to `sourceOf`, which it needs; a
      separate `background.ts` would have imported `agents.ts` in a circle.
  - Gate: `pnpm nx test comms-application`

- [x] **T02** — Application: the notifier holds a done change while the agent has background
      work and sends after two quiet rounds; blocked changes unchanged
  - Gate: `pnpm nx test comms-application`

- [ ] **T03** — Docs: the comms service guide; the spec's status `Done`
  - Gate: `pnpm verify:local`
