# ADR 0019 — Missions run as a bot in the planets' worktrees, queued by Pocket Comms

- **Status:** Accepted
- **Date:** 2026-11-27
- **Related:** ADR 0016, ADR 0018; spec 035; [the vision](../../mission-control.md)
- **Approved by:** the owner's grilling of 2026-11-27 (flight rules, section 2)

## TL;DR

A mission's agent is a Claude agent like a task's, in a worktree of the planet below the usual
worktrees root, but it commits, pushes, comments and merges as the Gitea user `mission-control`,
and runs with a settings file Pocket Comms ships (auto mode and a deny list). Pocket Comms keeps
the mission queue and every mission's state in `missions.json` in its state folder, the only
source of truth; Gitea holds records only. One mission runs at a time.

## Context

Step 3 of Mission Control (ADR 0016) lets an issue be carried out without the owner. The retired
pocket-mission daemon did this with its own clones, its own Herdr session, labels on Gitea as the
queue's truth, and forwarding of Gitea comments to waiting agents. Pocket Comms already starts
agents in worktrees, follows them in the cockpit, answers their questions on the owner's phone and
reads the pull requests they attach.

## Decision

- **Identity.** Missions act as one Gitea user, the mission bot, with its own token
  (`COMMS_MISSION_GITEA_TOKEN`), never the owner's. Pocket Comms sets the bot's git identity, a
  push URL over HTTP and a credential file in the mission's worktree only
  (`git config --worktree`); the owner's checkout keeps its identity. The agent reads the token through git
  for Gitea's API, and never uses `tea`, which is logged in as the owner.
- **Where.** A mission's worktree and agent are made the way a task's are: the same worktrees
  root, the same multiplexer, the same conversation view, tagged as a mission. No separate clones.
- **Guardrails.** Claude runs with `--settings` pointing at a file in the release: auto mode and
  pocket-mission's deny list (force-push, pushes to the default branch or of tags, the
  pocket-cloud Docker context, colima stop and delete, compose down, `tea` with the owner's
  login). The flight rules' stops still apply. Claude's folder-trust dialog in a mission's
  worktree is answered yes, because the server made that worktree, as pocket-mission did; any
  other dialog at the start waits for the owner.
- **One truth.** `missions.json` holds the queue and the states; the lane label, the in-progress
  label and comments on Gitea are records only. A mission's state follows facts the server reads:
  the agent's status in the multiplexer, the pull request it attached, and that pull request on
  Gitea. Nothing polls labels.
- **One at a time, first in, first out.** A lost mission (its agent gone after a restart) pauses
  the queue until the owner resumes or aborts it; nothing restarts on its own.
- **The owner answers in the cockpit.** Gitea comments are never forwarded to an agent.

## Consequences

- The owner can read along and type into a mission's agent like any other, from the phone.
- Gitea tells the bot's work from the owner's at a glance; branch protection can name the bot.
- A planet becomes ready for missions only once the bot may push to it (preflight's sixth check).
- The repository's shared git config gains `extensions.worktreeConfig` the first time a mission
  starts on it.
- The bot token is on disk twice, in the deployment's `.env` and in the credential file (mode
  600); the agent runs as the owner's user and could read either, so the deny list and the flight
  rules remain the guard, as in pocket-mission.

## Alternatives considered

- **Labels as the queue (pocket-mission):** two writers and polling, and a queue the owner could
  change from Gitea without the cockpit knowing.
- **Separate clones and session:** keeps missions apart, but the owner loses the one cockpit view.
- **The owner's identity:** no bot setup, but no telling the agent's work from the owner's.
- **Forwarding Gitea comments:** a second answer channel with deduplication and polling, for no
  gain while the owner answers on the phone.
