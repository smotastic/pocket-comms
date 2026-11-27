# Spec 038 — pocket-comms: Autopilot

- **Status:** `Done` — grilling of 2026-11-27, verified; built in this pull request
- **Grilling:** confirmed by the owner on 2026-11-27 (issue #148)
- **Changes:** [spec 034](../034-comms-planets-and-preflight/spec.md) (the autopilot level can be
  chosen), [spec 035](../035-comms-missions-to-merge/spec.md) (a mission sent by Autopilot, a
  mission waiting on Claude's usage limit)
- **Decision:** [ADR 0021](../../docs/architecture/adr/0021-autopilot-triages-with-pi-and-sends-hops-in-a-night-window.md)

## 1. Problem / intent (WHY)

Since spec 037 a mission goes from the owner's tap to production alone. The owner still picks every
issue, its lane and the moment it is sent. The last step of Mission Control
([the vision](../../docs/mission-control.md)) is **Autopilot**: overnight, Mission Control
chooses small, clear issues and their lanes by itself and ships them, so the owner wakes up to
deployed fixes, and to the full flights that wait for a grilling.

Autopilot spends the owner's subscriptions and acts without them, so it runs inside a safety
envelope: a time window, a budget, a breaker, and the planets the owner set to autopilot. The
owner stays the gate for full flights. Pi, on its own subscription, does the reading and judging
(the triage); Claude only codes (the missions).

## 2. Scope

- **In scope:** the autopilot level and its cap; the Autopilot window, the budget and the
  Autopilot switch; the triage with Pi and the labels and comments it leaves; sending hops, their
  order, the skip label and the breaker; Claude's usage limit on a mission; the morning summary;
  the Autopilot section of Mission Control.
- **Out of scope:** Autopilot starting full flights; missions side by side; triage during the
  day; the brainstorm recommending issues (#43); agents started outside Pocket Comms.

## 3. Requirements (WHAT)

### The level

1. The owner can choose **autopilot** for a planet on its planet page.
2. A planet at autopilot is at autopilot in effect only when preflight is go and its deploy checks
   pass; when go but its deploy checks fail, it is at **missions** in effect, so the owner's sends
   still work. A no-go planet is at manual, as before.

### The Autopilot window, the budget and the switch

3. Mission Control keeps the **Autopilot window**, a start and an end time of day in the server's
   local time (default 23:00 to 07:00; a window may cross midnight), the **budget**, the most
   missions Autopilot sends in one window across all planets (default 5, from 0 to 50), and the
   **Autopilot switch**, on or off for all planets (default on). The owner changes them in Mission
   Control.
4. Autopilot acts only while the switch is on and the time is inside the window. It sends a
   mission only when no mission runs and the mission queue is empty, so the owner's sends always
   go first. Missions still running when the window closes run on.
5. The owner's sends never count against the budget.

### The triage

6. When a window opens with the switch on, Mission Control **triages** each planet at autopilot in
   effect, once per window, before it sends anything.
7. The triage runs on Pi in the server, with the brainstorm's model and settings. Its tools only
   read: the planet's open issues, one issue's text, the folders and files of the planet's default
   branch on Gitea; and one tool that records its verdict on an issue. It has no tool that writes
   to a repository or to Gitea.
8. The triage takes the planet's open issues that are not pull requests and:
   - have no lane label and no `autopilot:not-ready` label, or
   - Autopilot triaged before and whose title or text changed since.
     It never takes an issue whose lane or `autopilot:not-ready` label the owner set, an issue
     labelled `status/in-progress` or `autopilot:skip`, an issue an open pull request names
     (`#<number>` in its title or text), an issue on an unfinished mission, or a fix issue (its
     title starts with "Fix the failed deploy"). It takes at most 30 issues per planet per window,
     oldest first; the rest wait for the next window.
9. For each issue, the triage gives one verdict with a one-line reason: **hop** (small, clear and
   testable), **full flight** (it needs the owner's grilling) or **not ready** (unclear, too
   large, or not code). The mission bot then sets the label `mission:hop`, `mission:full-flight`
   or `autopilot:not-ready`, removes the other two, and comments "Autopilot triage: <verdict> —
   <reason>".
10. When Pi is not set up, fails or hits its limit, that window's triage of the planet is skipped
    with the reason; hops labelled before are still sent.

### Sending

11. Autopilot sends only hops: open issues with the label `mission:hop` on planets at autopilot in
    effect, without `autopilot:skip`, `autopilot:not-ready` or `status/in-progress`, not named by
    an open pull request, not a fix issue, not sent by Autopilot before in this window, and that
    the mission queue would accept. It never
    sends a full flight; those wait for the owner, listed as ready for their grilling.
12. It picks issues with `priority/high` first, then `priority/medium`, then the rest; within each,
    the oldest (the lowest number) first. Planets take turns: the planet with the fewest missions
    sent in this window goes first, then by name.
13. A mission Autopilot sent is marked as such in the mission log.

### Stops

14. When a mission Autopilot sent fails, is aborted or is lost, the mission bot labels its issue
    `autopilot:skip`; Autopilot never sends it again.
15. Two such endings in a row, in this window, stop Autopilot for the rest of the window, and the
    owner is told: "Autopilot stopped for tonight: two missions in a row failed."
16. A paused planet holds its missions as before (spec 037); its issues are not sent.

### Claude's usage limit

17. A mission's Claude reports a reached usage limit and the time it resets. While it is reached,
    the mission is **waiting** with the reason "Claude's usage limit is reached; it resets at
    <HH:MM>." Claude waits for the reset and goes on by itself, also after the window closed
    (the owner's decision of 2026-11-27, verify V01); the mission follows it.
18. While any mission reports a reached usage limit, Autopilot sends nothing more in this window.

### The morning summary

19. When a window in which Autopilot triaged or sent anything closes, the owner gets one
    notification that sums it up, such as "Autopilot: 3 deployed, 1 failed, 2 full flights wait
    for your grilling, 4 not ready", with why it stopped or skipped a triage, when it did.
20. Mission Control has an **Autopilot** section: the switch, the window and the budget; and the
    current or latest window: the triage's verdicts with their reasons and issue links, the hops
    sent, the full flights ready for the owner's grilling, and why it stopped or skipped a
    triage.

## 4. Acceptance criteria

- Given a planet at autopilot whose deploy checks fail, then it is at missions in effect.
- Given the window 23:00 to 07:00, at 22:59 Autopilot does nothing; at 23:00 it triages; at 07:00
  it sends nothing more, and a running mission runs on.
- Given the switch off, then Autopilot neither triages nor sends.
- Given a budget of 2 and five hops, then it sends two in the window.
- Given a queued mission of the owner, then Autopilot sends nothing until the queue is empty.
- Given hops #3, #9 (`priority/high`) on planet A and #4 on planet B, then it sends A#9, then B#4,
  then A#3.
- Given an issue without a lane label, when the window opens, then the triage labels it and
  comments; an issue the owner labelled is not triaged; an issue edited after its triage is
  triaged again the next window.
- Given Pi not set up, then the triage is skipped with the reason and labelled hops are still
  sent, and the summary says why.
- Given a mission Autopilot sent that fails, then its issue gets `autopilot:skip`; given a second
  failure right after, then Autopilot stops for the window and the owner is told.
- Given a mission whose Claude reports a reached usage limit, then the mission is waiting with the
  reset time and Autopilot sends nothing more this window.
- Given a window in which Autopilot sent two hops, one deployed and one failed, then at its end the
  owner gets "Autopilot: 1 deployed, 1 failed".

## 5. Notes

- Labels: `mission:hop`, `mission:full-flight` (spec 035), `autopilot:not-ready`,
  `autopilot:skip`, `status/in-progress` (the bot's in-progress label), `priority/high`,
  `priority/medium`.
- Pi's tools are only the ones named in requirement 7; the verdict tool records in memory, and the
  bot writes the labels after Pi's turn.
- A mission's Claude reports its usage through the status line of the mission settings: Claude
  Code passes the status line its `rate_limits` (used percentage and reset time per window), as
  pocket-mission's status line used them. A limit is reached when a window is used to 100 %.
- The API gains `GET /api/v1/autopilot` and `PUT /api/v1/autopilot/settings`; a mission carries
  `autopilot: true` when Autopilot sent it; choosing `autopilot` on a planet is accepted.
