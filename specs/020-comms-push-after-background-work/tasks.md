# Tasks 020 — pocket-comms: hold the done push while background work runs

- **Plan:** [plan.md](./plan.md)

Each task is small and independently testable, a vertical slice where possible. Tick its checkbox
in the task's own commit.

- [ ] **T01** — Application: `makeBackgroundOf` in `use-cases/background.ts`, used by
      `agents.ts` in place of its own `backgroundOf`
  - Gate: `pnpm nx test comms-application`

- [ ] **T02** — Application: the notifier holds a done change while the agent has background
      work and sends after two quiet rounds; blocked changes unchanged
  - Gate: `pnpm nx test comms-application`

- [ ] **T03** — Docs: the comms service guide; the spec's status `Done`
  - Gate: `pnpm verify:local`
