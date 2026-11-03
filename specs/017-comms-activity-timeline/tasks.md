# Tasks 017 — pocket-comms: an activity timeline across agents

- **Plan:** [plan.md](./plan.md)

Each task is small and independently testable, a vertical slice where possible. Tick its checkbox
in the task's own commit.

## Backend

- [x] **T01** — Domain: activity shapes, `activityBetween`, `keepActivity`, `promptExcerpt`,
      `isLiveIn`
  - Gate: `pnpm nx test comms-domain`

- [x] **T02** — Application: `ActivityStoreOutbound`, `ActivityInbound` with the recorder,
      `Input` records prompts and keys, fakes
  - Gate: `pnpm nx test comms-application`, `pnpm ports:check`

- [x] **T03** — Infrastructure: `Activity.layerFile`
  - Gate: `pnpm nx test comms-infrastructure`

## API and server

- [x] **T04** — Contract `activity` group; handlers; acceptance test; server wiring; OpenAPI
      document
  - Gate: `pnpm nx test comms-contract`, `pnpm nx test comms-api`, `pnpm openapi:check`,
    `pnpm openapi:lint`

## Web app

- [x] **T05** — Design system: `AgentRow` without a link
  - Gate: `pnpm nx test design-ui`

- [x] **T06** — Web: client, query, live hook, `/activity` page, Activity link in the projects
      sheet
  - Gate: `pnpm nx test comms-web`

## Wrap-up

- [x] **T07** — README and comms `AGENTS.md`; local check at 390 px; spec status `Done`
  - Gate: `pnpm format:check`, the check's notes in the pull request

## Verification notes

- **T07** (2026-11-03): the built server on a spare port with a scratch state folder and the real
  Herdr. The first snapshot recorded nothing. Events seeded into `activity.json` survived a
  restart. At 390 px the Activity link sits above the projects, the page has no sideways scroll,
  a live agent's event opens its conversation, a gone agent's event opens `/projects/pocket-comms`,
  and a gone agent without a project is a plain row. The empty page says "Nothing happened in the
  last 24 hours."
