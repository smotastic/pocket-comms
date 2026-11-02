# Tasks 015 — pocket-comms: mark started issues in progress and show them apart

- **Plan:** [plan.md](./plan.md)

Each task is small and independently testable, a vertical slice where possible. Tick its checkbox
in the task's own commit.

## Backend

- [x] **T01** — Domain: `IN_PROGRESS_LABEL`, its style, `hasInProgressLabel`, `isInProgress`
      (label in any case, or a worktree on the issue)
  - Gate: `pnpm nx test comms-domain`

- [x] **T02** — Application: `GiteaOutbound.markInProgress`; the fake records labels; `implement`
      marks after `create`, skips an already labelled issue, reports a failure as `markNote`,
      marks nothing when `create` fails; `IssueDto.inProgress`
  - Gate: `pnpm nx test comms-application`, `pnpm ports:check`

- [x] **T03** — `Gitea.layerHttp.markInProgress`: paged label lookup in any case, create when
      missing (exact body), add with `POST …/issues/{n}/labels`, `403`/`404` mapping, no token in
      reasons, only `GET`/`PATCH`/`POST` sent
  - Gate: `pnpm nx test comms-infrastructure`

## API and server

- [ ] **T04** — Contract `Issue.inProgress` and `IssueTaskCreated.markNote`; handler; acceptance
      tests; OpenAPI document
  - Gate: `pnpm nx test comms-contract`, `pnpm nx test comms-api`, `pnpm openapi:check`,
    `pnpm openapi:lint`

## Web app

- [ ] **T05** — `groupIssues`; In progress and Open groups with counts on the project screen and
      in the projects sheet; the label tag hidden; `markNote` shown after a start
  - Gate: `pnpm nx test comms-web`

## Wrap-up

- [ ] **T06** — README and comms `AGENTS.md`: the label writes
  - Gate: `pnpm format:check`

- [ ] **T07** — Local check of the built app at 390 px with `agent-browser` and a fake Gitea, no
      real issue labelled; spec status `Done`
  - Gate: the check's notes in the pull request
