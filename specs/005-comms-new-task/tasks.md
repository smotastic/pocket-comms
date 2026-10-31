# Tasks 005 — pocket-comms v2: new task in a Herdr worktree

- **Plan:** [plan.md](./plan.md)

Each task is small and independently testable, a vertical slice where possible. Tick its checkbox
in the task's own commit.

## Backend

- [x] **T01** — Domain: `Workspace.root`, `Project` and `orderProjects`, `parseTask`,
      `parseBranch`, `AgentToStart`, `agentNameFor`
  - Gate: `pnpm nx test comms-domain`

- [x] **T02** — Application: `ProjectsOutbound`, `HerdrOutbound.createWorktree` and `startAgent`,
      errors, fakes; `TasksInbound` with `projects` and `create`
  - Gate: `pnpm nx test comms-application`, `pnpm ports:check`

- [x] **T03** — `Projects.layerGit`: list below the root, default base after fetch, branch exists,
      `check-ref-format`, all through `execFile`
  - Gate: `pnpm nx test comms-infrastructure`

- [x] **T04** — `Herdr.layerSocket`: `worktree.create` with `focus: false`, `agent.start`, longer
      timeouts, `worktree.repo_root` read into `Workspace.root`
  - Gate: `pnpm nx test comms-infrastructure`

## API and server

- [x] **T05** — Contract group `tasks` (`GET /projects`, `POST /tasks`) with descriptions and
      examples; handlers and problems; acceptance tests
  - Gate: `pnpm nx test comms-contract`, `pnpm nx test comms-api`

- [x] **T06** — Server config `COMMS_PROJECTS_ROOT`, `COMMS_AGENT_ARGS`, wiring, OpenAPI document
  - Gate: `pnpm nx test comms-server`, `pnpm openapi:check`, `pnpm openapi:lint`

## Design kit

- [ ] **T07** — Kit form controls `Select`, `TextArea`, `Switch`
  - Gate: `pnpm nx test design-ui`, `pnpm nx lint design-ui`

## Web app

- [ ] **T08** — Client methods `projects` and `createTask`; `suggestBranch`
  - Gate: `pnpm nx test comms-web`

- [ ] **T09** — New task action and sheet: picker, task, branch prefill, agent switch and kind,
      progress and errors; navigation to the agent or a confirmation on the overview; the note in
      the conversation
  - Gate: `pnpm nx test comms-web`

## Wrap-up

- [ ] **T10** — README and comms `AGENTS.md`: settings and the flow
  - Gate: `pnpm format:check`

- [ ] **T11** — Smoke check: one throwaway worktree in pocket-comms through the built app at
      390 px with `agent-browser`, then removed; spec status `Done`
  - Gate: the check's notes in the pull request
