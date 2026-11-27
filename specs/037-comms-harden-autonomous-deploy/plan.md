# Plan 037 — harden autonomous deploy

- **Status:** `Approved` — grilling of 2026-11-27, verified

Spec: [spec.md](spec.md). Decision: the addendum of ADR 0020.

## Domain (`packages/comms/domain`)

- `mission.ts`: the finished states `deploy-lost` and `down`; the deploy phase `ci`; the deploy's
  process id `pid`; the mission's `resumedAt`. `isDeployFailure(mission)`: rolled back, down,
  deploy lost, or failed with released versions (a failed release or deploy, never an agent's
  failure). `lastDeploy` takes the latest deployed mission or deploy failure; a failure whose
  `resumedAt` is set no longer pauses. `fixIssueBody` words the fix issue of each failure.
- `planet.ts`: `PlanetSettings.apps`, `PlanetRegistry.appsSeeded`, `seedAllowedApps` (the pairs of
  requirement 13) and `allowApps`. `DeployFacts.allowed` and the "apps" check refusing an app not
  allowed; `deployChecksOf` returns the named apps with whether each is allowed. `LastDeployFacts`
  words a pause without a fix issue and a deploy lost or down.
- `release.ts` is unchanged.

## Application (`packages/comms/application`)

- `DeployOutbound.start` returns the started process id and fails when the script does not start;
  `running(pid)` tells whether the process lives; `DeployResult.result` gains `down`.
- `GiteaOutbound.commitStatus(repository, sha)`: the combined CI state of a commit (`pending`,
  `success`, `failure`), none when Gitea cannot say. `MissionBotOutbound.closeIssue`.
- `missions.use-case.ts`:
  - `releasing` starts at phase `ci`; `releaseStep` waits on `commitStatus` of `deploy.target`
    (60 minutes), then tags. Red or late ends `not-deployed` without `broken`.
  - `deployStep` keeps `pid`; no result → `running(pid)` → wait (2 hours) or `deploy-lost`;
    `down` → `down`; `failed` → `failed`. Missions saved before 037 without `pid` keep the 15
    minutes.
  - `broken` covers `deploy-lost` and `down` with their notification titles and words; the fix
    issue is opened by `openFixIssue`, which the loop also calls for the planet's latest deploy
    failure without `fixIssue` and without `resumedAt`.
  - The loop's pause guard uses `isDeployFailure`, not `fixIssue`.
  - `deploy(id)` computes `planets.preflight(planet, true)` first and fails with
    `MissionRefusedError` when not at missions or not deploying.
  - A started owner's Deploy that ends `held`, `failed` or `not-deployed` goes back to
    `awaiting-deploy` with the reason; `withCompanions` clears `deployWith` when the lead waits
    again. `remove` of a queued Deploy puts it back to waiting instead of deleting it.
  - `planReleases` refuses a release whose app the planet does not allow (`Unsettled`).
  - `resumePlanet(planet)`: sets `resumedAt` on the latest deploy failure, closes its fix issue
    with "Resumed by the owner.", fails with `PlanetNotFoundError`/`MissionRefusedError` when
    nothing is paused.
- `planets.use-case.ts`: the deploy facts carry the planet's allowed apps; `allowApps(planet,
apps)`; the reused preflight is computed again when the planet's latest deploy changed (its
  id, state, fix issue or `resumedAt`), which covers requirement 9.
- `planet-registry.ts`: `seed` applies `seedAllowedApps` once to an existing registry without
  `appsSeeded`, and to a new one.

## Infrastructure (`packages/comms/infrastructure`)

- `deploy/layer.ts`: `start` waits for the child's `spawn` or `error` event and returns its pid;
  `running` uses `process.kill(pid, 0)` (`EPERM` counts as living); `down` is a known result.
- `gitea/http.ts`: `commitStatus` from `GET /repos/{owner}/{repo}/commits/{sha}/status`.
- `mission-bot/layer.ts`: `closeIssue` (`PATCH` state closed).
- `missions/file-store.ts`: the new states, phase, `pid` and `resumedAt` (the compile guard
  covers them). `planets/file-store.ts`: `apps` and `appsSeeded`.

## Contract and API (`packages/comms/contract`, `packages/comms/api`)

- Mission state enum gains `deploy-lost` and `down` (last); preflight's deploy section gains
  `apps: [{ app, allowed }]`; `POST /planets/{planet}/resume` (missions group: it changes the
  missions file); `PUT /planets/{planet}/apps` with `{ apps }` (planets group); the Deploy
  endpoint gains 409. Accepted diff lines in `.pocket-ci/openapi-accepted-changes.txt`.

## Web (`apps/comms-web`)

- `MissionControl.tsx`: names of the two states. `PreflightCard.tsx`: **Resume** when the
  last-deploy check fails, and the named apps with Allow/Disallow. `comms-client.ts`:
  `resumePlanet`, `allowApps`.

## pocket-cloud

- `scripts/deploy.sh` reports `down` when the rollback is not healthy either: one line, a pull
  request left open for the owner.

## Docs

- Spec 036 requirements 3, 9, 12, 14, 15 and 17 point to this spec; ADR 0020 gets the addendum;
  `docs/mission-control.md` mentions Resume and allowed apps.
