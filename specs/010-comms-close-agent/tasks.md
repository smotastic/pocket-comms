# Tasks 010 — pocket-comms: close an agent and its worktree

- **Plan:** [plan.md](./plan.md)

Each task is small and independently testable. Tick its checkbox in the task's own commit.

- [ ] **T01** — Server: the workspace's checkout, `removeWorktree`, `hasChanges`, the `close` use
      case, the endpoint, its problems and the OpenAPI document
  - Gate: `pnpm nx run-many -t test -p 'comms-*'`, `pnpm openapi:check`

- [ ] **T02** — Design kit: the `trash` icon
  - Gate: `pnpm nx run-many -t lint test -p design-ui`

- [ ] **T03** — Web: the conversation's Close action and its confirmation sheet
  - Gate: `pnpm nx test comms-web`, `pnpm verify:local`
