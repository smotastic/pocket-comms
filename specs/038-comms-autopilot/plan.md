# Plan 038 — Autopilot

- **Status:** `Approved` — grilling of 2026-11-27, verified

Spec: [spec.md](spec.md). Decision: ADR 0021.

## Domain (`packages/comms/domain`)

- `planet.ts`: `CHOOSABLE_LEVELS` gains `autopilot`. `effectiveAutonomy(chosen, result, deploys)`:
  autopilot falls to missions when the deploy checks fail (spec 2).
- `autopilot.ts` (new), pure:
  - `AutopilotSettings` (`enabled`, `start`, `end` as `HH:MM`, `budget`), `DEFAULT_AUTOPILOT`,
    `parseAutopilotSettings` (valid times, start ≠ end, budget 0–50).
  - `windowOf(settings, local)`: the window the local time is in, named by the date it opened
    (`YYYY-MM-DD`), or none; `local` is `{ date, yesterday, minutes }`, computed by the caller.
  - Triage: `TriageVerdict` (`hop`, `full-flight`, `not-ready`), `AUTOPILOT_LABELS`,
    `issueHash(title, body)`, `namedByPullRequests(open)` (the issue numbers open pull requests
    name), `toTriage(issues, triaged, excluded)` (requirement 8, at most 30, oldest first),
    `triageComment`.
  - Sending: `isSendableHop(issue, named)`, `pickHop(candidates, sentByPlanet)` (requirement 12).
  - Stops: `AUTOPILOT_FAILURES` (failed, aborted, lost), `breakerTripped` (two in a row).
  - `AutopilotNight` (the window's record: its key, the triage per planet with its verdicts or
    its skip reason, the missions sent, the failures already labelled, why it stopped, whether
    the summary was sent) and `nightSummary(night, missions)` (requirement 19).
- `mission.ts`: `Mission.autopilot` (sent by Autopilot), `Mission.limitedUntil` (Claude's usage
  limit, epoch ms); `MissionFacts.limitedUntil`; `missionStep` moves a working or waiting
  mission to waiting while the limit is in force and back when it ends (spec 17).

## Application (`packages/comms/application`)

- Ports:
  - `AutopilotOutbound` (new): load and save `autopilot.json` (settings, the issues Autopilot
    triaged with their hash and verdict, the current or latest night).
  - `UsageLimitsOutbound` (new): `limits`, the reached usage limits by Claude session id with
    their reset time.
  - `MissionBotOutbound.relabel(repository, number, add, remove)`: adds one label (created when
    missing) and removes the named ones.
- `missions.use-case.ts`: `send` takes `{ autopilot: true }` and keeps it on the mission;
  `factsOf` reads the running mission's usage limit; the loop stores `limitedUntil` and the
  waiting reason. The DTO carries `autopilot` and the waiting reason.
- `planets.use-case.ts`: `effectiveAutonomy` with the deploy checks; `choose` accepts autopilot.
- `autopilot.use-case.ts` (new), its own loop every 30 seconds and a lock:
  1. The local time gives the window (server's time zone, `Date`).
  2. A night whose window ended, or another window, gets its summary sent once.
  3. Inside the window with the switch on: a new night starts; the planets at autopilot in
     effect are triaged once (Pi, below); the night's missions are checked for failures (skip
     label, breaker); a reached usage limit stops the night; then at most one hop is sent per
     step when no mission runs, the queue is empty and the budget has room.
- `triage` (in `tools/triage-tools.ts` and the use case): one Pi turn per planet through
  `AgentRuntime.runTurn` with the instructions, the issues to triage in the input, and the tools
  `read_issue`, `list_folder`, `read_file` (Gitea `entryNames`/`fileText` on the default branch)
  and `record_verdict`. `notSetUp` or a failed turn skips the planet with the reason. The bot
  applies each verdict's label and comment after the turn; the issue's hash is kept.
- Notifications go through the push ports, as missions' do.

## Infrastructure (`packages/comms/infrastructure`)

- `autopilot/file-store.ts`: `autopilot.json` with a schema and the compile guard against the
  domain types, as the missions file.
- `usage-limits/layer.ts`: reads `<state>/limits/<session>.json` (`{ "until": <unix s> }`).
- `mission-bot/layer.ts`: `relabel`; the layer writes the mission settings it passes to Claude to
  `<state>/mission/claude-settings.json`: the shipped settings plus a `statusLine` that runs the
  shipped `statusline.sh` with the limits folder.
- Missions file: `autopilot` and `limitedUntil` (compile guard).

## Server (`apps/comms-server`)

- `mission/statusline.sh`: reads Claude's status JSON; writes the latest reached reset time of
  `rate_limits` (used ≥ 100 %) for its `session_id`, or removes the file; prints a short line.
- Composition: the new layers; the Pi runtime is shared with the brainstorm.

## Contract and API (`packages/comms/contract`, `packages/comms/api`)

- `GET /autopilot` (settings, the night, the planets at autopilot), `PUT /autopilot/settings`.
- `Mission.autopilot`; the autonomy level `autopilot` can be chosen. Response additions are
  appended last; widened enums get accepted lines as before.

## Web (`apps/comms-web`)

- `PreflightCard`: Autopilot is a level to choose; when it falls to missions, the card says why.
- `MissionControl`: an **Autopilot** section (switch, window, budget; the night's triage verdicts
  with reasons and links, hops sent, full flights ready for grilling, stop and skip reasons); an
  Autopilot mark on its missions.

## Docs

- ADR 0021; the glossary (Autopilot window, triage, budget); `docs/mission-control.md` step 5;
  spec 034/035 pointers; `packages/comms/AGENTS.md` if it lists state files.

## Risks

- Claude's status line JSON is the only usage source; without `rate_limits` nothing is detected,
  and missions behave as before.
- A Pi turn may run minutes; it runs in the Autopilot loop, never under the missions lock.
