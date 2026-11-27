# Spec 037 — pocket-comms: harden autonomous deploy

- **Status:** `Done` — grilling of 2026-11-27, verified; built in this pull request
- **Grilling:** confirmed by the owner on 2026-11-27 (issue #145)
- **Changes:** [spec 036](../036-comms-autonomous-deploy/spec.md) (requirements 3, 9, 12, 14, 15
  and 17), [spec 034](../034-comms-planets-and-preflight/spec.md) (a planet's settings gain its
  allowed apps)
- **Decision:** the addendum of
  [ADR 0020](../../docs/architecture/adr/0020-missions-deploy-through-pocket-clouds-deploy-script-with-bot-cut-releases.md)

## 1. Problem / intent (WHY)

The first live deploys of spec 036 and an independent review found that the edges of a failed
deploy leave production, the mission log and the planet's pause disagreeing: a deploy that takes
longer than 15 minutes is reported as rolled back while it goes on; a deploy whose rollback failed
too is reported as rolled back while production is down; a fix issue that cannot be opened pauses
a planet for 90 days or not at all; the owner's Deploy can vanish; and any planet's `AGENTS.md`,
which missions edit and merge alone, can name any app, even comms itself. A merge is also tagged
before its own CI run on master has finished.

This feature makes every failed deploy end in a state that says what is true, pause its planet
until the owner says otherwise, keep the owner's Deploy until it ships, let a planet deploy only
the apps the owner allowed, and release only a merge that master's CI passed.

## 2. Scope

- **In scope:** the deploy script's process and its end without a result; the states **deploy
  lost** and **down**; the pause after every failed release or deploy, the retry of its fix issue,
  and **Resume** on the planet page; the owner's Deploy checking first and never getting lost;
  each planet's allowed apps in its settings, seeded once, shown and changed on the planet page,
  and enforced by the deploy checks and the release; waiting for master CI on the merge commit.
- **Out of scope:** finding a release run by its tag (#142); planning from the last tag that
  actually released (#143); a result per release of a mission (#144); a lock in pocket-cloud's
  deploy script (pocket-cloud#89); setting up the backup store; how tags and versions are
  computed.

## 3. Requirements (WHAT)

### A deploy that ends without a result

1. While a deploy runs, comms knows its process. As long as the process lives, the mission keeps
   **deploying**, for at most 2 hours.
2. When the process ended without a result, or still runs after 2 hours, the mission is **deploy
   lost**: the planet is paused (requirement 6), a fix issue says that the deploy's outcome is
   unknown and must be checked by hand, and the owner is told.
3. A deploy script that cannot start at all (such as a missing or not executable file) fails the
   mission at once with the reason, as a failed release does; it never waits for a result.

### A deploy whose rollback failed

4. When the deploy script reports that the rollback was not healthy either, the mission is
   **down**: the owner gets an urgent notification ("<planet> is down: deploy and rollback
   failed"), the fix issue says so with the script's output, and the planet is paused.
5. A deploy script that reports a failure before it deployed anything (such as a failed backup)
   fails the mission with its output, as a failed release does.

### The pause

6. Every failed release, rolled-back deploy, **deploy lost** and **down** pauses its planet: the
   last-deploy check fails, whether or not its fix issue exists.
7. When the fix issue could not be opened, comms tries again on every step of its loop until it
   is open.
8. The pause lifts when the fix issue is closed, or when the owner taps **Resume** on the planet
   page. Resume closes the open fix issue as the mission bot with the comment "Resumed by the
   owner."
9. A planet's preflight right after a new pause or a Resume shows it; it does not wait for the
   60 seconds preflight is reused.

### The owner's Deploy

10. Deploy first computes the planet's preflight. When the planet is no-go, is not at missions or
    does not deploy, Deploy refuses with the reason and the missions keep waiting for the owner.
11. When a queued Deploy cannot start when its turn comes (the planet is no-go then, or its
    releases cannot be planned), or master's CI fails or does not finish before its tags
    (requirement 17), the mission and the missions that ship with it go back to **merged, waiting
    for you to deploy**, with the reason.
12. Removing a queued Deploy from the mission queue puts it back to waiting for the owner; the
    missions that shipped with it wait on their own again.

### Allowed apps

13. A planet's settings hold the apps its releases may deploy. A newly registered planet allows
    none. The settings of today's planets are seeded once: pocket-comms, pocket-lens,
    pocket-coach, pocket-galaxy and pocket-learning allow the app of the same name, pocket-home
    allows pocket-home-server and pocket-home-web, and every other planet none.
14. A release that names an app the planet does not allow fails the deploy check "apps" with
    "<app> is not allowed for <planet>.", so the planet does not deploy; a release planned for a
    merge or a Deploy refuses it too.
15. The planet page shows the apps the releases name, each allowed or not, and lets the owner
    allow or disallow each.

### Master CI

16. Before it pushes any tag, a releasing mission waits for the CI of the commit it releases on
    the default branch, for at most 60 minutes.
17. When that CI fails, the mission ends **merged, not deployed** with "master CI failed on
    <commit>."; when it does not finish within 60 minutes, with "master CI did not finish within
    60 minutes." Neither opens a fix issue nor pauses the planet. An owner's Deploy waits for the
    owner again instead (requirement 11).

### The cockpit

18. The mission log names the new states: **Deploy lost** and **Down**.

## 4. Acceptance criteria

- Given a deploy whose script still runs after 15 minutes, then the mission keeps deploying;
  when the script then writes a healthy result, the mission is **deployed**.
- Given a deploy whose script ended without a result, then the mission is **deploy lost**, a fix
  issue is open, and the planet is no-go.
- Given a deploy script that cannot start, then the mission fails at once with the reason, and
  the planet is paused.
- Given a deploy script that reports its rollback unhealthy too, then the mission is **down**, the
  owner is told that the planet is down, and the planet is paused.
- Given a rolled-back deploy whose fix issue could not be opened, then the planet is paused, and
  the next step of the loop opens the issue.
- Given a paused planet, when the owner taps Resume, then the planet is go again at once and its
  fix issue is closed with "Resumed by the owner."
- Given a mission waiting for the owner's Deploy on a planet that is no-go, when the owner taps
  Deploy, then it is refused with the reason and the mission still waits.
- Given a queued Deploy whose planet became no-go before its turn, then the lead and its
  companions wait for the owner's Deploy again, with the reason.
- Given pocket-learning whose `AGENTS.md` names the app pocket-comms, then its deploy check "apps"
  fails with "pocket-comms is not allowed for pocket-learning." until the owner allows it.
- Given a merged mission whose merge commit's CI on master is still running, then no tag is
  pushed until it succeeded; a failed run ends the mission **merged, not deployed**.

## 5. Notes

- New mission states, as the API and the missions file name them: `deploy-lost` and `down`, both
  finished. The deploy phases gain `ci`, before `tag`.
- The deploy script's result `down` means its rollback was not healthy either; `failed` means it
  failed before it deployed anything. A script that does not yet know `down` reports `failed`;
  such a mission fails and pauses its planet (requirement 5) until the script reports `down`.
- The planets file gains each planet's `apps` and the marker that the allowed apps were seeded.
- The API gains `POST /api/v1/planets/{planet}/resume` and `PUT /api/v1/planets/{planet}/apps`;
  preflight's deploy section gains the apps the releases name with whether each is allowed; the
  Deploy of a mission may answer 409 with the reason.
- Widening the mission state enum in the responses of `GET /api/v1/missions` is accepted per
  change in `.pocket-ci/openapi-accepted-changes.txt`, as for spec 036.
