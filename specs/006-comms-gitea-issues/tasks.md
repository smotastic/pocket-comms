# Tasks 006 — pocket-comms: a project's Gitea issues and "Implement with Claude"

- **Plan:** [plan.md](./plan.md)

Each task is small and independently testable, a vertical slice where possible. Tick its checkbox
in the task's own commit.

## Backend

- [ ] **T01** — Domain: `Issue`, `GiteaRepository`, `parseRemote`, `orderIssues`, `issueBranch`,
      `issueNumberOf`, `issueTask`, `workOnIssues`
  - Gate: `pnpm nx test comms-domain`

- [ ] **T02** — Application: `GiteaOutbound`, `ProjectsOutbound.originUrl` and `worktrees`, errors,
      DTOs, fakes; `IssuesInbound` with `issues` and `implement` (on the spec 005 `create`)
  - Gate: `pnpm nx test comms-application`, `pnpm ports:check`

- [ ] **T03** — `Projects.layerGit`: `originUrl`, `worktrees`
  - Gate: `pnpm nx test comms-infrastructure`

- [ ] **T04** — `Gitea.layerHttp` with the recorded, anonymised fixture: `GET` only, paging, the
      cap, errors without the token, no request without a token
  - Gate: `pnpm nx test comms-infrastructure`

## API and server

- [ ] **T05** — Contract group `issues` with descriptions and examples; handlers and problems;
      acceptance tests
  - Gate: `pnpm nx test comms-contract`, `pnpm nx test comms-api`

- [ ] **T06** — Server config `COMMS_GITEA_URL`, `COMMS_GITEA_TOKEN`, `COMMS_GITEA_HOSTS`, wiring,
      OpenAPI document
  - Gate: `pnpm nx test comms-server`, `pnpm openapi:check`, `pnpm openapi:lint`

## Design kit

- [x] **T07** — Icon `issues`
  - Gate: `pnpm nx test design-ui`

## Web app

- [ ] **T08** — Client methods `issues` and `implementIssue`; the Projects action and `/projects`
  - Gate: `pnpm nx test comms-web`

- [ ] **T09** — `/projects/$project`: the three states, issue rows with labels, link and work; the
      Implement sheet with the prefilled branch, progress, errors and navigation
  - Gate: `pnpm nx test comms-web`

## Wrap-up

- [ ] **T10** — README and comms `AGENTS.md`: settings, the token, the flow
  - Gate: `pnpm format:check`

- [ ] **T11** — Local check of the built app at 390 px with `agent-browser` and a fake Gitea, no
      agent started on a real issue; spec status `Done`
  - Gate: the check's notes in the pull request
