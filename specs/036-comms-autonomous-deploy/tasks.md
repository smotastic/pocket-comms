# Tasks 036 — pocket-comms: autonomous deploy

- **Plan:** [plan.md](./plan.md)
- **Status:** `Approved` — grilling of 2026-11-27, verified

Requirements are the spec's numbers (R1–R18).

## Domain

- [x] **T01** — `release.ts`: parse the `json mission-control` block of an `AGENTS.md` into
  releases and migration paths, with a reason when it is missing or invalid; path patterns with
  `*` and `**`. (R1, R2, R3) Gate: domain unit tests.
- [x] **T02** — `release.ts`: the next version of a release from the commits since its last tag
  (`feat`, `fix`, `perf`, breaking, none, no tag yet, 0.x), and the release plan of a merge:
  which releases ship, nothing to release, or a stop for a breaking change or a migration. (R6,
  R7, R15) Gate: domain unit tests.
- [x] **T03** — `mission.ts`: the new states and a mission's deploy (its releases, the step, the
  versions, the fix issue); running and finished sets; a planet with a mission waiting for the
  owner; `planet.ts`: the last-deploy check and the deploy checks in the preflight. (R4, R5, R8,
  R17) Gate: domain unit tests.

## Ports and adapters

- [x] **T04** — `DeployOutbound` and its infrastructure adapter: `check(app)` runs
  `deploy.sh check`, `start` runs the script detached with a result file in the state folder,
  `result` reads it; `COMMS_DEPLOY_SCRIPT` in the config and composition. (R3, R13, R14) Gate:
  adapter tests against a fake script in a temporary folder.
- [x] **T05** — `RepositoriesOutbound`: fetch the planet's tags, list the tags of a prefix, the
  commits since a tag with their files, and the default branch's head, from the planet's
  checkout. (R6, R7, R9) Gate: adapter tests against temporary repositories with an isolated git
  environment.
- [x] **T06** — `GiteaOutbound.tagRun` (a tag's release workflow run) and `MissionBotOutbound`
  `pushTag` and `openIssue`. (R9, R12) Gate: adapter tests against the fake Gitea.

## Use cases

- [x] **T07** — Preflight: read the block from `AGENTS.md` on the default branch, the deploy
  checks through `DeployOutbound`, and the last-deploy check from the missions file and the fix
  issue's state. (R3, R4, R18) Gate: planets use-case tests.
- [x] **T08** — Missions after the merge: not deployed, nothing to release, waiting for the owner
  (and a planet's later missions with it), releasing with tags and release runs, deploying one app
  at a time, deployed with the issue comment; the queue waits while releasing or deploying. (R5–R11)
  Gate: missions use-case tests.
- [x] **T09** — A rolled-back or failed deploy: the mission's state and output, the fix issue,
  the notification; a result that never comes after 15 minutes; a restart while deploying. (R12,
  R14, R4) Gate: missions use-case tests.
- [x] **T10** — The owner's Deploy: queue the planet's waiting missions with the backup, release
  and deploy them together, a breaking change's bump. (R15, R16) Gate: missions use-case tests.

## API and cockpit

- [x] **T11** — Contract and API: the new states, `versions`, `POST /missions/{mission}/deploy`,
  the preflight's deploy section; the OpenAPI document regenerated and linted; the accepted line
  for the widened state union. (R15, R17, R18) Gate: API tests, `openapi:lint`, `openapi:diff`.
- [ ] **T12** — Web: Mission Control shows the new states, the versions and Deploy; the planet
  page shows the deploy checks and whether the planet deploys. (R15, R17, R18) Gate: web tests.

## Docs, pocket-cloud and planets

- [ ] **T13** — The vision's step 4, the glossary (Release, Deploy check), comms' `AGENTS.md`
  with its own Mission Control block. (R1) Gate: `pnpm verify:local`.
- [ ] **T14** — pocket-cloud `scripts/deploy.sh` with `check`, health check, rollback, backup and
  the JSON result, its README and `.env.example`; a pull request left for the owner. (R13) Gate:
  the fake-tool harness in the scratchpad, `bash -n`.
- [ ] **T15** — Each other planet's `AGENTS.md` (coach, factory, galaxy, home, learning, lens):
  the Mission Control block, and release tags cut by the mission bot where docs called them the
  owner's. (R1, R2) Gate: each planet's CI.
