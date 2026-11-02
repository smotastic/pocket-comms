# Tasks 012 — pocket-comms: a flat list of agents and a projects sheet

- **Plan:** [plan.md](./plan.md)

Each task is small and independently testable, a vertical slice where possible. Tick its checkbox
in the task's own commit.

## Rows

- [x] **T01** — Tokens: the project palette (`color.project.1`–`5`, `neutral`) in both themes
  - Gate: `pnpm tokens:check`, `pnpm nx run-many -t lint test -p design-tokens design-ui`

- [x] **T02** — Design kit `AgentRow` as the new two-line row (status dot with its wording,
      worktree, project label and hue, tints); the web app maps agents to it on the overview and
      the project page, with the project colour from the projects list and no label on the
      project page
  - Gate: `pnpm nx run-many -t lint test -p design-ui comms-web`

## Overview

- [x] **T03** — Design kit `FilterChips`; the overview's Needs you and Everything else groups,
      the project filter and its reset
  - Gate: `pnpm nx run-many -t lint test -p design-ui comms-web`

## Projects sheet

- [x] **T04** — Design kit: `Sheet` with `side="end"`, `Disclosure` and `IssueCard`
  - Gate: `pnpm nx run-many -t lint test -p design-ui`

- [x] **T05** — Web: the Projects action and sheet (counts, one entry open, issue cards and
      their states, Implement, New task, Project page); the overview's Projects list goes
  - Gate: `pnpm nx test comms-web`

- [x] **T06** — Web: Close in place on an issue card, sharing spec 010's close mutation
  - Gate: `pnpm nx test comms-web`

## Wrap-up

- [ ] **T07** — The built app at 390 px against the live Herdr and Gitea, compared with prototype
      variant I; `pnpm verify:local`
  - Gate: `pnpm verify:local`
