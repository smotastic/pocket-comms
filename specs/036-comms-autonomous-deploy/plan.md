# Plan 036 — pocket-comms: autonomous deploy

- **Spec:** [spec.md](./spec.md)
- **Status:** `Approved` — grilling of 2026-11-27, verified
- **Decision:** [ADR 0020](../../docs/architecture/adr/0020-missions-deploy-through-pocket-clouds-deploy-script-with-bot-cut-releases.md)

## 1. Affected projects

| Path                                            | Change                                                                                                                                                                                                                                                                                                                                           | Tags                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| `packages/comms/domain`                         | `release.ts`: the Mission Control block, path patterns, the next version, the release plan; `mission.ts`: the new states and a mission's deploy; `planet.ts`: the last-deploy check and the deploy checks                                                                                                                                        | `scope:comms`, `type:domain`                |
| `packages/comms/application`                    | ports: `DeployOutbound` (new), `RepositoriesOutbound` (tags and commits from the planet's checkout), `GiteaOutbound` (a tag's release run), `MissionBotOutbound` (push a tag, open an issue); `missions.use-case.ts`: release and deploy after the merge, the owner's Deploy; `planets.use-case.ts`: the deploy checks and the last-deploy check | `scope:comms`, `type:application`           |
| `packages/comms/infrastructure`                 | `deploy/` (new): runs pocket-cloud's script, detached, and reads its result file; git, Gitea and bot adapters for the new port methods                                                                                                                                                                                                           | `scope:comms`, `type:infrastructure`        |
| `packages/comms/contract`, `packages/comms/api` | the mission's new states, versions and Deploy; the preflight's deploy section                                                                                                                                                                                                                                                                    | `scope:comms`, `type:contract` / `type:api` |
| `apps/comms-server`                             | `COMMS_DEPLOY_SCRIPT`; composition; OpenAPI regenerated                                                                                                                                                                                                                                                                                          | `scope:comms`, `type:app`                   |
| `apps/comms-web`                                | Mission Control: the new states and Deploy; the planet page: the deploy checks                                                                                                                                                                                                                                                                   | `scope:comms`, `type:app`                   |
| `docs/`                                         | ADR 0020, the vision's step 4, the glossary (Release, Deploy check)                                                                                                                                                                                                                                                                              | —                                           |
| pocket-cloud `scripts/deploy.sh`                | the deploy script with check, health check, rollback and a JSON result (a pull request the owner merges)                                                                                                                                                                                                                                         | —                                           |
| the planets' `AGENTS.md`                        | the Mission Control block; release tags are no longer only the owner's                                                                                                                                                                                                                                                                           | —                                           |

## 2. Contract changes

- `MissionState` gains `releasing`, `deploying`, `deployed`, `rolled-back`, `not-deployed`,
  `nothing-to-release` and `awaiting-deploy`. An added union member is a breaking change for the
  diff gate; one owner-accepted line in `.pocket-ci/openapi-accepted-changes.txt` (spec 022), the
  same rule as spec 035's.
- A mission gains `versions` (the tags it released) — optional, compatible.
- `POST /missions/{mission}/deploy` (new): 204, 404 when no such mission waits for the owner.
- `Preflight` gains `deploy: { deploys: boolean, checks: PreflightCheck[] }` — added, compatible;
  a check's name is an open string since #125, so `last-deploy` is compatible too.

## 3. Migrations

None. `missions.json` takes the new fields as optional; an older file loads as it is.

## 4. Test strategy

- **Unit (domain):** the block's parsing (valid, missing, invalid JSON, no release); path
  patterns with `*` and `**`; the next version for `feat`, `fix`, `perf`, breaking, none, no tag
  yet, 0.x; the release plan with paths; the migration stop; the last-deploy check.
- **Use case (fakes):** merged → releasing → deploying → deployed with the next queued mission
  after it; not-deployed with the failing check; nothing-to-release; awaiting-deploy frees the
  slot and a later mission of the planet waits too; Deploy queues it with the backup; a failed
  release run; rolled-back opens the issue, notifies and makes preflight no-go until the issue is
  closed; a restart while deploying reads the result file; a result that never comes after 15
  minutes.
- **Infrastructure:** the deploy adapter against a fake script in a temporary folder (check,
  detached start, result file); the git methods against temporary repositories with an isolated
  environment (`GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE` removed, a temporary `HOME`), never the
  real repository; the Gitea run of a tag against the fake server.
- **API / web:** the deploy endpoint's statuses; Mission Control shows the states and Deploy; the
  planet page shows the deploy checks.
- **pocket-cloud:** `deploy.sh` against fake `docker`, `curl` and install scripts on `PATH` with a
  temporary `.env`, in the scratchpad only; `bash -n` and shellcheck where available.
- **Boundaries:** dependency-cruiser and the Nx tags unchanged: the domain stays pure, the deploy
  script is reached only through `DeployOutbound`.

## 5. Risks

- **Comms deploying itself.** The script runs detached in its own session, so the restart that
  launchd does does not stop it; the result file in the state folder carries the result across
  the restart, and 15 minutes without a result rolls back (spec requirement 14).
- **Long release builds.** A release workflow may take many minutes; the loop polls without
  holding the lock, a run that never appears within 10 minutes or ends after 60 fails the
  mission.
- **Parallel hop missions** (#126–#129) change `missions.use-case.ts` and `planet.ts` on master
  while this is built; merge master in before each push.
- **Wrong version from commit subjects.** A subject that is not a conventional commit counts as
  nothing to ship; the gates already enforce conventional subjects on every merge.
