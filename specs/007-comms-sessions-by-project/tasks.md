# Tasks 007 — pocket-comms: the overview by project

- **Plan:** [plan.md](./plan.md)

Each task is small and independently testable, a vertical slice where possible. Tick its checkbox
in the task's own commit.

## Backend

- [x] **T01** — Domain: `Workspace.project` and `worktree`; the shared Other group, last; an
      unlisted workspace lands in Other
  - Gate: `pnpm nx test comms-domain`

- [x] **T02** — Adapter: `toWorkspace` reads `repo_name` and `is_linked_worktree`; the
      `workspace.list` fixture gains a linked worktree, a main checkout and a plain workspace
  - Gate: `pnpm nx test comms-infrastructure`

- [x] **T03** — Application: `AgentDto.project` and `worktree`, set wherever an agent is sent
  - Gate: `pnpm nx test comms-application`

## API and server

- [x] **T04** — Contract: optional `project` and `worktree` on `Agent`, the `other` group key;
      acceptance tests; OpenAPI document
  - Gate: `pnpm nx test comms-contract`, `pnpm nx test comms-api`, `pnpm openapi:check`,
    `pnpm openapi:lint`

## Design kit

- [x] **T05** — Icon `menu`; `IconButton` `marked`; `AgentRow` `tag`, cut at half the line; stories
  - Gate: `pnpm nx test design-ui`

## Web app

- [x] **T06** — `rowTag` and the row name: the workspace label instead of the pane id, the tag
      rules of requirement 7
  - Gate: `pnpm nx test comms-web`

- [ ] **T07** — Overview as cards: Needs you card, a card per project, Other last
  - Gate: `pnpm nx test comms-web`

- [ ] **T08** — Project filter: `filterOverview`, the menu button with its mark, the sheet with
      counts and the Needs-you mark, reset on reload
  - Gate: `pnpm nx test comms-web`

## Wrap-up

- [ ] **T09** — Spec 004 pointer to this spec; comms `AGENTS.md` if a rule changed
  - Gate: `pnpm format:check`

- [ ] **T10** — Local check of the built app at 390 px with `agent-browser` against live Herdr;
      spec status `Done`
  - Gate: the check's notes in the pull request
