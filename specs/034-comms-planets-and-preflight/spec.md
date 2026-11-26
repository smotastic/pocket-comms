# Spec 034 — pocket-comms: planets and preflight

- **Status:** `Done` — grilling of 2026-11-26, verified; built in #117 and the pull request of `feat/planets-and-preflight`
- **Grilling:** confirmed by the owner on 2026-11-26
- **Changes:** [spec 005](../005-comms-new-task/spec.md) (the projects a task can start in),
  [spec 007](../007-comms-sessions-by-project/spec.md) (cards by project),
  [spec 008](../008-comms-project-home/spec.md) (the project page),
  [spec 013](../013-comms-brainstorm-chat/spec.md) (the projects the brainstorm knows)
- **Decision:** [ADR 0018](../../docs/architecture/adr/0018-planets-are-registered-and-preflight-is-computed-from-facts.md)

## 1. Problem / intent (WHY)

Mission Control (ADR 0016, [the vision](../../docs/mission-control.md)) will send issues on
missions that an agent carries out alone. Before it may, it must know which repositories the owner
wants it to work on, and whether each of them is ready: a mission on a repository without CI, or
with a red default branch, has no referee. Today every git repository below the projects root is a
"project", with no settings and no readiness at all.

This feature makes the repositories the owner works on **planets**: registered by the owner, each
with its settings, a computed **preflight** with the result go or no-go, and an **autonomy level**
that preflight caps. It sends no missions yet (step 3 of the vision); it gives step 3 what it needs
and shows the owner, now, which planets would be ready.

## 2. Scope

- **In scope:** the word planet everywhere in the app; registering and unregistering planets; a
  one-time seed of the registry; preflight with the five checks below; the chosen and the
  effective autonomy level; the planets sheet and the planet page showing them.
- **Out of scope:** sending missions, the bot identity, dev-port isolation and their checks
  (step 3); deploy recipes, health checks, rollback and their checks (step 4); running a planet's
  verify command in Pocket Comms; choosing the Missions or Autopilot level; overriding a planet's
  verify command; checking preflight in the background; renaming the server's
  `COMMS_PROJECTS_ROOT` setting.

## 3. Requirements (WHAT)

### Planets

1. A **planet** is a git repository directly below the projects root that the owner registered.
   The registry and each planet's settings are kept in the server's state folder, in one file;
   there is no database.
2. When the server starts and no registry exists yet, it registers, once, every repository below
   the projects root whose `origin` is on the app's Gitea, except `pocket-cloud` and
   `pocket-mission`. From then on only the registry decides; the app has no other rule about
   which repository may be a planet.
3. Only planets are offered for work: the planets sheet and the planet pages, **New task**,
   **Implement** and an issue's **Close**, the brainstorm's list of planets and its proposals.
   A request for work in a repository that is not a planet is refused as unknown.
4. A workspace on a repository that is not a planet belongs to **Other**, as a workspace without
   a repository does.
5. The owner registers a repository below the projects root that is not a planet from the planets
   sheet; it starts at the autonomy level **manual**.
6. The owner unregisters a planet from its planet page. Its agents and worktrees keep running and
   move to **Other**; its settings are removed, so registering it again starts at **manual**.

### Preflight

7. **Preflight** of a planet is computed only from facts, never from an agent's judgement. Its
   checks, in this order:
   1. **Gitea:** the planet's `origin` names a repository on the app's Gitea, and the server can
      read it.
   2. **AGENTS.md:** the default branch on Gitea has an `AGENTS.md` at its top level.
   3. **CI workflow:** the default branch has a workflow file in `.gitea/workflows` or
      `.github/workflows`.
   4. **CI green:** the newest run of CI for a push to the default branch that has finished, not
      counting cancelled or skipped runs, succeeded. A newer run still going is shown as running
      and does not change the result.
   5. **Verify script:** the default branch's top-level `package.json` has a `verify` script.
8. Each check passes or fails with one sentence that says why. When the Gitea check fails, the
   others fail too, saying they could not be checked. A planet with no CI run finished yet fails
   **CI green**.
9. The result is **go** when every check passes, otherwise **no-go**.
10. Preflight is computed when the planets sheet or a planet page asks for it, every planet's
    checks independently, and is reused for 60 seconds. Nothing computes it in the background.

### Autonomy level

11. The **chosen** autonomy level of a planet is kept with its settings. In this spec it is always
    **manual**: **missions** and **autopilot** are shown as coming and cannot be chosen.
12. The **effective** autonomy level is never kept. It is computed whenever it is read: the chosen
    level, lowered to **manual** when preflight is no-go. Preflight never raises it.

### Cockpit

13. The planets sheet lists every planet with a **go** or **no-go** tag, and after them an
    **Other repositories** section with each repository below the projects root that is not a
    planet and a **Register** action.
14. The planet page has a **Preflight** card: the result, each check with its reason, the chosen
    and the effective autonomy level, and **Unregister**, which asks in place before it
    unregisters.

### The word

15. The app, its API and its docs call a planet a planet: no "project" is left in the code, the
    API or the web app in that sense. The planet page lives at `/planets/<name>`.

## 4. Acceptance criteria

- Given no registry and the repositories `pocket-home`, `pocket-cloud`, `pocket-mission` and
  `setup` (origin on GitHub) below the root, when the server starts, then exactly `pocket-home` is
  a planet.
- Given a registry, when the server restarts, then the planets stay as they were, even when a new
  repository appeared below the root.
- Given `setup` is not a planet, when the owner opens the planets sheet, then `setup` shows under
  **Other repositories**, and **Register** makes it a planet at **manual**.
- Given an agent on a worktree of `pocket-home`, when the owner unregisters `pocket-home`, then the
  agent keeps running and shows in **Other**, and New task is no longer offered for it.
- Given a request to start a task in a repository that is not a planet, then the server answers
  that the planet is unknown.
- Given a planet whose newest finished CI run on the default branch failed and a newer run still
  going, when preflight is computed, then **CI green** fails, says the run is still going, and the
  result is no-go.
- Given a planet whose newest push run was cancelled and the one before succeeded, then **CI
  green** passes.
- Given a planet without a `verify` script, then **Verify script** fails and the result is no-go.
- Given Gitea cannot be reached, then every check fails, the result is no-go, and the page still
  loads.
- Given a planet's preflight computed 30 seconds ago, when the page asks again, then Gitea is not
  read again; after 60 seconds it is.
- Given the planet page, when the owner taps **Unregister**, then it asks in place, and only the
  confirmation unregisters.
- Given a no-go planet, then its effective level is **manual**; given a go planet chosen at
  **manual**, its effective level is **manual**.
- Given the planet page of `pocket-home`, then its address is `/planets/pocket-home`, and no text
  in the app calls it a project.

## 5. Notes

- The repositories below the root that are not planets are not planets: the code calls them
  repositories, and the setting that names the root keeps its name `COMMS_PROJECTS_ROOT`, because
  the deployment (pocket-cloud) sets it.
- Step 3 will compute preflight again, without reusing it, before it sends a mission, and will add
  **Send on a mission** to an issue next to Implement.
