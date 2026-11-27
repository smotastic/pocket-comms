# ADR 0021 — Autopilot triages with Pi and sends hops in a night window

- **Status:** Accepted
- **Date:** 2026-11-27
- **Related:** ADR 0014, ADR 0018, ADR 0019, ADR 0020; spec 038; [the vision](../../mission-control.md)
- **Approved by:** the owner's grilling of 2026-11-27 (flight rules, section 2)

## TL;DR

At the **autopilot** level, Mission Control chooses issues and their lanes by itself. Inside the
owner's **Autopilot window** (default 23:00 to 07:00) it **triages** each planet at autopilot once
with Pi, in the server, with read-only tools; the mission bot labels each issue a hop, a full
flight or not ready, with the reason as a comment. It then sends only hops, one at a time while
the mission queue is empty, within a **budget**, until two failures in a row or Claude's usage
limit stop it. Full flights wait for the owner's grilling. When the window closes, the owner gets
one summary.

## Context

Since spec 037 a mission ships from the owner's tap to production alone, and the owner still
picks every issue and lane. Autopilot acts while the owner sleeps and spends their subscriptions:
Claude's on the missions, Pi's on reading. A wrong judgement must cost little: a mislabelled
issue, not a broken production or a night of failed missions.

## Decision

- **Pi triages, Claude codes.** The triage runs on the brainstorm's Pi runtime (ADR 0014) with
  four tools: read an issue, list a folder and read a file of the default branch on Gitea, and
  record a verdict in memory. It has no tool that writes; the mission bot writes the labels and
  comments after the turn. Claude only runs missions.
- **The owner stays the gate for full flights.** Autopilot sends only hops; a full flight waits,
  listed as ready for the owner's grilling. A label the owner set is never triaged again; one
  Autopilot set is triaged again when the issue's title or text changed.
- **A safety envelope.** A time window in the server's local time and only while the mission
  queue is empty, so the owner's sends go first; a budget per window across all planets; an issue
  whose mission fails, aborts or is lost is labelled `autopilot:skip` and never sent again; two
  such endings in a row stop the window; a reached Claude usage limit stops it too; and one
  switch turns Autopilot off for all planets.
- **The level needs the deploy checks.** A planet is at autopilot in effect only when preflight is
  go and its deploy checks pass, so what Autopilot merges ships with a health check and a
  rollback; otherwise the planet is at missions in effect.
- **Claude's usage reaches comms through the mission status line.** The server writes the mission
  settings with a status line that keeps the reset time of a reached limit per conversation in
  the state folder, as pocket-mission did with herdr tokens. Claude waits for the reset and goes
  on by itself; comms shows the mission waiting and Autopilot sends nothing more that window.

## Consequences

- A night can label many issues; each label has its reason on the issue, and the owner can change
  any of them. Re-labelling by the owner ends Autopilot's say on that issue.
- The triage spends Pi's usage once per window and planet, on at most 30 issues each.
- A mission sent by Autopilot that hits the usage limit may finish after the window, on the
  owner's subscription (the owner's decision of 2026-11-27).
- The owner reads one summary in the morning; the mission log marks Autopilot's missions.

## Alternatives considered

- **Claude triages in a read-only session:** spends the coding subscription on reading, and a
  read-only Claude still needs a deny list rather than having no write tools at all.
- **Only issues the owner labelled:** safe, but the owner still triages by hand.
- **Autopilot starts full flights:** the grilling would wait on a sleeping owner and block the one
  mission slot.
- **Any time the queue is idle:** competes with the owner's daytime use of the same subscription.
- **Interrupting a mission at the usage limit after the window:** relies on an unverified key on
  Claude's limit screen; the owner chose to let it carry on.
