# Tasks 010 — pocket-comms: close a Gitea issue from the issue list

- **Plan:** [plan.md](./plan.md)

Each task is small and independently testable, a vertical slice where possible. Tick its checkbox
in the task's own commit.

## Backend

- [x] **T01** — Application: `GiteaOutbound.closeIssue`, the fake records closes,
      `IssuesInbound.close` (open → closed once, closed → no write, pull request or missing →
      `IssueNotFoundError`, no remote or token → nothing)
  - Gate: `pnpm nx test comms-application`, `pnpm ports:check`

- [x] **T02** — `Gitea.layerHttp`: `send` behind `get` and the close; `closeIssue` (`PATCH` with
      `{"state":"closed"}`, `403` and `404` mapping, no token in reasons, no redirect, no `DELETE`)
  - Gate: `pnpm nx test comms-infrastructure`

## API and server

- [ ] **T03** — Contract endpoint `close` and the group description; handler with the existing
      problems; acceptance tests; OpenAPI document
  - Gate: `pnpm nx test comms-contract`, `pnpm nx test comms-api`, `pnpm openapi:check`,
    `pnpm openapi:lint`

## Web app

- [ ] **T04** — Client method `closeIssue`; the Close button on each row; the `CloseIssue` sheet
      (number and title, work warning, progress, error kept, cancel); the notice and the refetch
  - Gate: `pnpm nx test comms-web`

## Wrap-up

- [ ] **T05** — README and comms `AGENTS.md`: the `write:issue` scope and the adapter's one write
  - Gate: `pnpm format:check`

- [ ] **T06** — Local check of the built app at 390 px with `agent-browser` and a fake Gitea, no
      real issue closed; spec status `Done`
  - Gate: the check's notes in the pull request
