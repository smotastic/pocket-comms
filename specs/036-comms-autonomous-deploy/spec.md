# Spec 036 — pocket-comms: autonomous deploy

- **Status:** `Approved` — grilling of 2026-11-27, verified
- **Grilling:** confirmed by the owner on 2026-11-27
- **Changes:** [spec 035](../035-comms-missions-to-merge/spec.md) (a merged mission goes on to
  release and deploy), [spec 034](../034-comms-planets-and-preflight/spec.md) (preflight gains the
  deploy checks and the last-deploy check)
- **Decision:** [ADR 0020](../../docs/architecture/adr/0020-missions-deploy-through-pocket-clouds-deploy-script-with-bot-cut-releases.md)

## 1. Problem / intent (WHY)

Step 3 runs a mission to merged code, and then the owner still releases and deploys by hand: a
night of missions leaves a pile of merged work that nobody can use until the owner sits down.
The owner wants the whole flow, idea to production, to need them only for the grilling
([the vision](../../docs/mission-control.md), step 4).

This feature carries a merged mission on to production: the mission bot cuts the planet's next
release, pocket-cloud's deploy script deploys it, a health check proves it, and a failed health
check rolls it back and pauses the planet. A database migration, a breaking change and a failed
deploy still need the owner.

## 2. Scope

- **In scope:** a planet's release settings in its `AGENTS.md`; the deploy checks and the
  last-deploy check in preflight; cutting the release as the bot; waiting for its release
  workflow; running pocket-cloud's deploy script and reading its result, also across a restart of
  comms itself; the new mission states; the stops for a migration and a breaking change with the
  owner's **Deploy**; a rolled-back deploy pausing the planet and opening an issue; pocket-cloud's
  `scripts/deploy.sh` with health check and rollback for every app; each planet's `AGENTS.md`.
- **Out of scope:** autopilot; reverting master after a failed deploy; bumping the design kit in
  the apps; batched or scheduled deploys; deploying a migration without the owner; a separate
  deploy switch per planet; creating the deploy settings' values in `.env` (the owner's setup).

## 3. Requirements (WHAT)

### A planet's releases

1. A planet names its **releases** in a Mission Control block of its `AGENTS.md` on the default
   branch. Each release has a tag prefix (such as `pocket-galaxy-v`), optionally the paths whose
   changes it ships, optionally the release workflow that its tag starts, and optionally the app
   that pocket-cloud's deploy script deploys. A release without an app is **published** only (the
   design kit). The block also names the planet's **migration paths**.
2. A merged change ships in a release when it touches the release's paths, or always when the
   release names none.

### Preflight

3. Preflight gains **deploy checks**, beside the six checks of spec 035: the planet's `AGENTS.md`
   has a valid Mission Control block with at least one release; the server knows pocket-cloud's
   deploy script; and the deploy script knows every app the releases name, with its health check
   and a version to roll back to. The deploy checks decide whether the planet **deploys**; they do
   not change go or no-go, nor the effective level.
4. Preflight gains a seventh check, **last deploy**: it fails while the planet's latest deploy was
   rolled back and its "fix the failed deploy" issue is still open. A failed check makes the
   planet no-go, so its effective level is manual (spec 034).

### After the merge

5. A planet at **missions** deploys. When a mission is merged and the planet deploys, the mission
   goes on instead of ending; when the planet does not deploy, it ends **merged, not deployed**
   with the failing deploy check as its reason.
6. For every release the merged change ships, the next version follows the conventional commits
   on the default branch since the release's last tag that touch its paths: a `feat` raises the
   minor number, a `fix` or `perf` the patch number. A release with neither has nothing to ship.
   When no release has anything to ship, the mission ends **merged, nothing to release**.
7. A breaking change (`!` or `BREAKING CHANGE`) among those commits, or a change to a migration
   path among them (a release ships every commit since its last tag, not only the mission's),
   stops the mission at **merged, waiting for you to deploy**
   with the reason. It leaves the running slot, so the mission queue goes on.
8. While a planet has a mission waiting for the owner to deploy, every later merged mission of
   that planet also waits for the owner, because its release would ship the waiting change.
9. Otherwise the mission is **releasing**: comms, as the mission bot, pushes each release's tag
   on the default branch's head, which holds the merge, and waits for the release workflow's run of the tag when the release
   names one. A run that fails, that does not appear within 10 minutes, or that does not finish within 60 minutes fails the mission with the reason, and the planet is
   paused as requirement 12 says.
10. Then the mission is **deploying**: comms runs pocket-cloud's deploy script for each release
    with an app, one after the other, and a published-only release is done once its workflow
    succeeded. The mission queue waits until the mission is **deployed** or **rolled back**.
11. When every deploy reports healthy, the mission is **deployed**, with the versions in its log
    entry and a comment on the issue.

### Deploy, health check and rollback (pocket-cloud)

12. When the deploy script reports that a deploy failed its health check and rolled back, the
    mission is **rolled back** with the script's output. Comms opens the issue "Fix the failed
    deploy of <release> <version>" on the planet as the bot, with that output, and notifies the
    owner. The planet's last-deploy check then fails (requirement 4). Master is not reverted.
13. pocket-cloud's `scripts/deploy.sh <app> <version>` pins the app's version in `.env`, deploys
    it (a stack, a native part, or both), waits up to two minutes for its containers to be
    healthy, then probes the app's health URL. On a failure it pins the previous version again,
    deploys that, checks it again, and reports the rollback. It reports its result as one JSON
    line. `scripts/deploy.sh check <app>` reports, without changing anything, whether it knows the
    app, has its health URL, and has a version to roll back to.
14. Deploying comms itself restarts the server. The deploy script then runs detached and writes
    its result to the server's state folder; the restarted server reads it and finishes the
    mission. A deploy whose result never arrives within 15 minutes is rolled back as requirement
    12 says, with that reason.

### The owner's Deploy

15. A mission waiting for the owner to deploy offers **Deploy** in the mission log. Deploy runs
    pocket-cloud's backup of the planet's database first, then releases and deploys as
    requirements 9 to 12 say. The mission joins the end of the mission queue as **queued** and
    does so when its turn comes. A breaking change raises the major number, or the minor number
    below 1.0.
16. Deploying one waiting mission of a planet deploys all the planet's waiting missions together;
    they end with the same result.

### The cockpit

17. The mission log and the running mission show the new states: **releasing**, **deploying**,
    **deployed**, **rolled back**, **merged, nothing to release**, **merged, not deployed** with
    its reason, and **merged, waiting for you to deploy** with its reason and Deploy.
18. A planet page shows the deploy checks under the preflight checks, and whether the planet
    deploys.

## 4. Acceptance criteria

- Given a planet at **missions** whose deploy checks pass, when a mission merges a `fix` touching
  a release's paths, then the bot tags the next patch version, the release workflow runs, the
  deploy script deploys it healthy, and the mission is **deployed** with the version; the next
  queued mission starts only then.
- Given a planet whose `AGENTS.md` has no Mission Control block, then a merged mission ends
  **merged, not deployed** with that reason.
- Given a merged mission whose commits are only `docs` and `refactor`, then it ends **merged,
  nothing to release**, and no tag is pushed.
- Given a merged pull request that touches a migration path, then the mission waits for the owner
  to deploy, the next queued mission starts, and Deploy runs the backup, then releases and deploys.
- Given a breaking commit since the last tag, then the mission waits for the owner; Deploy raises
  the minor number of a 0.x version.
- Given a deploy whose health check fails, then the script deploys the previous version again, the
  mission is **rolled back**, an issue with the output is open on the planet, the owner gets a
  notification, and the planet is no-go until that issue is closed.
- Given comms deploys itself, when the server restarts during the deploy, then the restarted
  server reads the result and the mission is **deployed** (or **rolled back**).
- Given the design kit's release, when a factory mission merges a `feat` of the kit, then the bot
  tags it, the publish workflow succeeds, and the mission is **deployed** without the deploy
  script.
- Given `deploy.sh check <app>` for an unknown app, a missing health URL or no version to roll
  back to, then it says which, and changes nothing.

## 5. Notes

- The Mission Control block is a fenced code block with the info string `json mission-control` in
  `AGENTS.md`:
  `{"releases":[{"tag":"coach-v","paths":["apps/","packages/"],"workflow":"release-coach.yml","app":"pocket-coach"}],"migrations":["packages/*/infrastructure/src/persistence/migrations/"]}`.
  Paths are prefixes; `*` matches one path segment and `**` any number.
- A tag is `<prefix><major>.<minor>.<patch>`. A release without a tag yet starts from `0.0.0`.
- The new mission states, as the API and the file name them: `releasing`, `deploying`, and the
  finished `deployed`, `rolled-back`, `not-deployed`, `nothing-to-release`, `awaiting-deploy`.
  `merged` stays for a merge before step 4's settings exist.
- The server reads the deploy script's path from the setting `COMMS_DEPLOY_SCRIPT`; without it
  the deploy check "deploy script" fails.
- The deploy script's apps, their version settings and tag prefixes: `pocket-galaxy`
  (`POCKET_GALAXY_VERSION`, `pocket-galaxy-v`), `pocket-home-server`
  (`POCKET_HOME_SERVER_VERSION`, `home-server-v`), `pocket-home-web` (`POCKET_HOME_WEB_VERSION`,
  `home-web-v`), `pocket-learning` (`POCKET_LEARNING_VERSION`, `learning-v`), `pocket-coach`
  (`POCKET_COACH_VERSION`, `coach-v`), `pocket-lens` (`POCKET_LENS_VERSION`, `lens-v`, stack and
  native part), `pocket-comms` (`POCKET_COMMS_VERSION`, `comms-v`, native part). Each health URL is
  an `.env` setting `<VERSION SETTING without _VERSION>_HEALTH_URL`.
