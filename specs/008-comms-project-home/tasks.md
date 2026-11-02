# Tasks 008 — pocket-comms: one home, one page per project

- **Plan:** [plan.md](./plan.md)

Each task is small and independently testable. Tick its checkbox in the task's own commit.

- [ ] **T01** — Design kit: icon `forward`, `SectionHeader` with a title link; story and spec
  - Gate: `pnpm nx run-many -t lint test -p design-ui`

- [ ] **T02** — Web: the project page with Agents, Issues and New task for its project; New task
      without a picker
  - Gate: `pnpm nx test comms-web`

- [ ] **T03** — Web: the overview without filter and actions, linked card headers, the Projects
      list; `/projects` leads home; the filter and Projects screen removed
  - Gate: `pnpm nx test comms-web`, `pnpm verify:local`
