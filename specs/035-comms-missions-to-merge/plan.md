# Plan 035 — pocket-comms: missions to merge

- **Spec:** [spec.md](./spec.md)
- **Status:** `Done` — grilling of 2026-11-27, verified

Three pull requests, each green on its own: **(A)** the server (domain, queue, bot, API, skill,
settings, docs), **(B)** the cockpit, **(C)** the brainstorm's lane picker. A pocket-cloud pull
request forwards the new setting; the owner merges and installs it with the bot setup.

## 1. Affected projects

| Path                                       | Change                                                                                                                                                                                                                                                                                                                                              | Tags                                 |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `packages/comms/domain` (`src/mission.ts`) | Lanes and their labels, the mission record and file, its states, what may be sent, the queue's next mission, the log (order, 90 days, new count), the state a running mission is in from facts, the first prompts; `planet.ts`: the sixth check, choosing a level                                                                                   | `scope:comms`, `type:domain`         |
| `packages/comms/application`               | Ports `MissionsOutbound` (the file), `MissionBotOutbound` (Gitea as the bot, and the worktree's git identity); `AgentStart.args` on the multiplexer port; `makeMissions` use case (send, remove, abort, resume, outcome, list, seen, the advance loop); `MissionsInbound`; preflight reads the bot; `Planets.choose`; overview marks mission agents | `scope:comms`, `type:application`    |
| `packages/comms/infrastructure`            | `missions` file store; `mission-bot` (Gitea over HTTP with the bot token, git `config --worktree`, the credential file); hc and Herdr pass `args` after the configured ones                                                                                                                                                                         | `scope:comms`, `type:infrastructure` |
| `packages/comms/contract`                  | `Missions` group; `sendOnMission`, `chooseAutonomy`, `missionOutcome` endpoints; `mission-bot` check; proposal lane (C)                                                                                                                                                                                                                             | `scope:comms`, `type:contract`       |
| `packages/comms/api`                       | Handlers and problems for the new endpoints                                                                                                                                                                                                                                                                                                         | `scope:comms`, `type:api`            |
| `apps/comms-server`                        | Setting `COMMS_MISSION_GITEA_TOKEN`; `mission/claude-settings.json` (auto mode, deny list); skill `skills/comms-mission`; composition starts the advance loop                                                                                                                                                                                       | `scope:comms`, `type:app`            |
| `apps/comms-web` (B, C)                    | Mission Control route `/missions` with running, queue and log; start-screen entry with the new count; **Send on a mission** with the lane picker on issues; the **missions** level in the Preflight card; a mission tag on the agent whose name is the running mission's agent; the proposal's lane picker (C)                                      | `scope:comms`, `type:app`            |
| docs                                       | ADR 0019; glossary (mission bot, mission log, held, lost); `docs/mission-control.md`; `packages/comms/AGENTS.md`                                                                                                                                                                                                                                    | —                                    |

### How (A)

- **File.** `missions.json` in the state folder: `{ version: 1, seenAt, missions: [...] }`. A
  mission: `id`, `planet`, `repository` (owner, name), `issue` (number, title, url), `lane`,
  `state`, `sentAt`, `startedAt?`, `finishedAt?`, `worktree?` (path, branch, workspaceId),
  `agent?` (name), `session?`, `pullRequest?` (ref, url), `outcome?`, `reason?`. Finished missions
  older than 90 days are dropped on every write. An unreadable file is kept as `.bad` and a new
  one starts, as `planets.json` does.
- **One writer.** Every change goes through one semaphore in the use case.
- **Sending** (`POST /planets/{planet}/issues/{number}/mission`, body `{ lane }`): bot token set;
  fresh preflight (the reuse is skipped); effective level ≥ missions; the issue open and not a
  pull request; no unfinished mission of the issue. The bot sets the lane label (creating it, and
  removing the other lane's), then the mission is queued.
- **The advance loop.** A fiber in the layer's scope runs `advance` on every multiplexer change,
  at most every 5 seconds, and every 30 seconds anyway. `advance`:
  1. For the running mission, read facts: the live agent with its name and status from the
     snapshot; the attached pull requests of its session (`PullRequestsOutbound.load`) on its
     repository; that pull request's state on Gitea. A pure domain function maps the facts to the
     next state: gone → `lost`; `blocked` → `waiting`; attached → `pull-request`; merged →
     `merged`; closed → `failed`.
  2. `merged`: close its workspace, remove its worktree unless it has changes, comment on the
     issue, set `finishedAt`.
  3. Nothing running and nothing lost: take the oldest queued; fresh preflight; no-go → `held`.
     Otherwise: the worktree (the kept one of the issue, or a new one on `issueBranch(issue)`
     from the default branch), `MissionBot.prepareWorktree`, open it, launch Claude with
     `--settings <mission settings>` and the first prompt, mark in progress and comment as the
     bot. A failure on the way is `failed` with the reason.
- **Bot in git.** `extensions.worktreeConfig` on the planet's repository, then in the mission's
  worktree only (`git config --worktree`): `user.name`, `user.email` (the bot's from Gitea),
  `commit.gpgsign false`, `remote.origin.pushurl` the Gitea HTTP URL, `credential.helper` reset
  and set to `store --file <state>/mission/git-credentials` (mode 600, written at start from the
  token). The agent reads the token for the API through `git credential fill`.
- **Abort** (`POST /missions/{id}/abort`) and **failure**: close the workspace, keep the
  worktree, the bot removes the in-progress label and comments the reason. **Outcome**
  (`POST /agents/{agent}/mission/outcome`, `{ result: done | failed, outcome }`), sent by the
  agent through the `comms-mission` skill. **Resume** (`POST /missions/{id}/resume`): open the
  worktree, start Claude with `--settings` and `--resume <session>`. **Remove**
  (`DELETE /missions/{id}`) for queued ones. **Seen** (`POST /missions/seen`).
- **List** (`GET /missions`): `{ running?, queue, log, newCount }`.
- **Autonomy** (`PUT /planets/{planet}/autonomy`, `{ level }`): manual or missions; autopilot is
  refused.
- **Preflight.** Facts gain the bot: no token, or `permissions.push` of the repository read with
  the bot token.

## 2. Contract changes

All additive except one: the `mission-bot` check makes preflight report six checks, and a planet
without the bot setup becomes no-go. No client reads the number of checks. New endpoints are compatible;
the cockpit tags a mission's agent from `GET /missions`, so the agent shape stays. The OpenAPI diff reports the new check value
as breaking; it is accepted with one line in `.pocket-ci` (spec notes). Every new field has a
description and an example (the lint).

## 3. Migrations

None. `missions.json` is new; no existing file changes shape.

## 4. Test strategy

- Unit (domain): lanes and labels; send rules; queue order and the next mission; facts → state;
  the log, its order, 90 days and the new count; prompts; the sixth check; choosing a level.
- Application, with fakes: send refused (no token, manual, no-go, closed, twice); queued then
  started (worktree, bot setup, args, prompt, label, comment); held; waiting; pull request; merged
  and cleanup (and a dirty worktree kept); abort; failed outcome; closed pull request; lost after
  a restart and resume; seen.
- Infrastructure: the missions file round trip and a broken file; the bot's git config only in
  the worktree (a real temporary repository); the bot adapter against a fake Gitea; hc and Herdr
  pass `args`.
- API: the new endpoints answer as the contract says, with problems for each refusal.
- Web (B, C): Testing Library for the Mission Control screen, Send on a mission, the autonomy
  picker and the proposal lane picker.
- Boundaries: dependency-cruiser and the Nx tags as they are.

## 5. Risks

- **`extensions.worktreeConfig`** changes the planet's shared git config once. It only lets each
  worktree have its own config; the owner's checkout keeps its identity.
- **The token on disk** in the credential file (mode 600) next to the state. The agent can read
  it, as it can read `.env`; the deny list and the flight rules are the guard, as in pocket-mission.
- **A planet without the bot setup is no-go** after this deploy, until the owner adds the bot.
- **The loop and the owner acting at once** (abort while merging): one semaphore orders them.
