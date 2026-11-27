# Mission Control

Where Pocket Comms goes next: from a cockpit that watches the agents the owner starts to one that
also runs **missions**, issues that agents carry out alone from the brainstorm to production.
Words are in the [glossary](../GLOSSARY.md); the decision on the workflow is
[ADR 0016](architecture/adr/0016-pocket-comms-owns-the-workflow-and-the-flight-rules.md).

## The gap

Today every agent exists because the owner started it, and every feature waits for the owner to
approve its spec and plan. Nearly all of the owner's effort goes into the grilling; the approvals
after it are ceremony. Work should flow: the owner shapes an issue in the brainstorm, sends it on
a mission, and it is grilled if needed, built, merged and deployed without them.

## The shape

- **Pocket Comms stays the product and the repository.** Mission Control is a new bounded
  context in this repository (`packages/mission-control`), composed into `comms-server` for now.
  It starts agents through the comms service's agent start, and `comms-web` is the one cockpit
  for manual agents and missions alike.
- **Flight rules and the process live in Pocket Comms** and reach every agent it starts; each
  planet keeps its engineering rules, specs, ADRs and glossary (ADR 0016).
- Agents start in the planet's worktree, never in a Pocket Comms folder.

## Lanes

A mission's lane is a label on its issue. The label both queues the issue and chooses the lane.

| Lane            | Label                 | Steps                                                                                                    |
| --------------- | --------------------- | -------------------------------------------------------------------------------------------------------- |
| **Full flight** | `mission:full-flight` | grilling → spec → plan → tasks → verify → implement → pull request → CI and code review → merge → deploy |
| **Hop**         | `mission:hop`         | implement → pull request → CI and code review → merge → deploy                                           |

- The grilling happens in the mission agent's conversation, through agent questions, because the
  agent has the code. The owner's confirmation of its summary is the approval.
- The verify step fixes its CRITICAL and HIGH findings at most twice, then asks the owner.
- An agent that needs the owner asks an agent question; Pocket Comms shows it under **Needs you**
  and sends a notification.
- Schema changes, secrets, destructive actions and failed gates always stop for the owner.

The owner sends an issue on a mission with one of two actions, or sets the label in Gitea. The
brainstorm's issue proposals and edit proposals carry a lane picker (none, hop or full flight):
Pi preselects a lane with a one-line reason, and accepting a proposal with a lane sends its
mission.

## Planets and preflight

- A **planet** is a repository registered with Mission Control. Its settings (registration,
  autonomy level, exclusions) are owner settings in the comms state folder; there is no database.
  Folders that are not planets fall under **Other**. pocket-cloud is never a planet.
- **Preflight** is a checklist computed from facts, never an agent's judgement, with the result
  **go** or **no-go**: Gitea reachable with the mission identity, an `AGENTS.md`, a CI gate on
  the default branch and that branch green, the verify command known and passing, not excluded,
  dev ports isolatable when missions run side by side. Deploying adds a deploy recipe, a health
  check after the deploy and an automatic rollback.
- The **autonomy level** is the owner's choice per planet, **manual**, **missions** or
  **autopilot**, capped by preflight. Preflight never raises it.

## Missions

- One mission at a time across all planets, until dev ports can be isolated.
- Missions commit, push and comment as a bot user with its own Gitea token; manual task starts
  run as the owner.
- The cockpit shows each mission's state: queued, working, waiting on you, pull request, merged,
  deployed; or held (preflight no-go when its turn came), failed, aborted and lost (its agent gone
  after a restart).
- The owner answers a mission's agent in the cockpit; Gitea keeps the questions as a record.
- The mission log lists the finished missions with their outcome, marking what is new since the
  owner last looked.

## Order

Each step is its own ADR or spec.

1. **The workflow move:** ADR 0016, the pocket-factory constitution amendment, flight rules and
   process skills in Pocket Comms, the verify step. Manual agents gain from it at once. _Done:_
   ADRs 0016 and 0017, pocket-factory ADR 0018.
2. **Planets and preflight:** the registry, the rename from project to planet, the checklist in
   the cockpit. Spec 034, ADR 0018.
3. **Missions to merge:** sending on a mission, from a brainstorm proposal accepted with a lane or
   by **Send on a mission** on an existing issue (next to Implement, with the same lane picker);
   the lane labels, the bot user, the mission queue, the mission's state in the cockpit. Sending
   computes preflight again, without reusing it. The mission log shows what finished overnight;
   a merged mission shows as "merged, not deployed" until step 4. Spec 035, ADR 0019.
4. **Autonomous deploy:** deploy recipes, health checks and rollback in preflight.
5. **Autopilot:** Mission Control chooses issues and their lanes by itself.

## Not now

Autopilot, missions side by side, autonomous deploy before a planet's preflight has a rollback,
and agents started outside Pocket Comms. pocket-mission is retired; it remains a reference for
the Claude trust dialog, shared dev ports, usage limits, the bot user and the deny list.
