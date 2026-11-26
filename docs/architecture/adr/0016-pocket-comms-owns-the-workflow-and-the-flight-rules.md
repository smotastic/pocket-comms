# ADR 0016 — Pocket Comms owns the workflow and the flight rules

- **Status:** Accepted
- **Date:** 2026-11-26
- **Related:** constitution principles 4, 5, 8, 9; ADR 0001; [Mission Control](../../mission-control.md)

## TL;DR

How agents work (grilling, specs, plans, the verify step, merge and deploy) moves out of every
planet into Pocket Comms, as **flight rules** and process skills that Pocket Comms gives to every
agent it starts. Each planet keeps only its engineering rules and its artifacts. One workflow
then has one source, and the owner's grilling becomes the only approval a feature needs.

## Context

Every pocket repository is a copy of the pocket-factory template. Each carries the same
constitution (version 2.0.0, pocket-learning already at 2.0.1) and its own copy of the process
skills: `grill-me`, the Spec Kit skills, `git-and-pr-conventions`. Copies drift, and a process
change has to be made once per repository.

The constitution mixes two kinds of rule:

- **How agents may work**, the same everywhere: spec-first by tier (4), CI as the referee (5),
  small tested changes (7), human-in-the-loop (8), no bypassing guardrails (9), proper solutions
  (10), English artifacts.
- **How this stack is built**, true only for Effect and Nx repositories: hexagonal layers (1), no
  logic in the database (2), contracts first (3), blueprints before generation (6).

Principle 8 asks for a human to approve every feature spec and plan and every release. In
practice the owner approves every spec and plan; nearly all of their effort goes into the
grilling before the spec. The approval is ceremony, and it stops every mission Mission Control
would run.

The owner starts all agents from Pocket Comms. Pocket Comms already gives agents a skill:
`comms-attach-pull-request` reaches every agent through a link in the global skills folder to the
deployed Pocket Comms.

In scope: where the process rules and skills live, how agents get them, and what approves a
feature. Out of scope: Mission Control's code, the planet registry, preflight and the deploy
recipes; they get their own specs.

## Options

| Criterion                             | Copies in each repo (today) | A shared package from pocket-factory | Pocket Comms, given to every agent     | Agents start in a Pocket Comms home folder                                                 |
| ------------------------------------- | --------------------------- | ------------------------------------ | -------------------------------------- | ------------------------------------------------------------------------------------------ |
| One source for the process            | ❌ one copy per repo        | ✅                                   | ✅                                     | ✅                                                                                         |
| A process change reaches every agent  | ❌ per repo                 | ⚠️ after a bump in every repo        | ✅ with the next Pocket Comms deploy   | ✅                                                                                         |
| Agent works in the planet's worktree  | ✅                          | ✅                                   | ✅                                     | ❌ must change folder; trust, hooks, settings and the session file follow the start folder |
| Pocket Comms can tie agent to planet  | ✅                          | ✅                                   | ✅                                     | ❌ it reads the pane's folder and session file                                             |
| Works for an agent started elsewhere  | ✅                          | ✅                                   | ⚠️ only with the global skills present | ❌                                                                                         |
| Coupling of the repos to Pocket Comms | ✅ none                     | ✅ none                              | ⚠️ strong                              | ❌ total                                                                                   |

Legend: ✅ good · ⚠️ caveat · ❌ bad

## Decision

We will split the constitution and move the process to Pocket Comms:

1. **Flight rules** in Pocket Comms hold the rules on how agents may work (today's principles 4,
   5, 7, 8, 9, 10 and English artifacts). They are the floor: a planet may add stricter rules,
   never looser ones.
2. Each planet's **constitution** keeps only its engineering rules (today's principles 1, 2, 3,
   6). Specs, ADRs and the glossary stay in the planet.
3. The **process skills and spec templates** live only in Pocket Comms: `grill-me`, the Spec Kit
   skills, `git-and-pr-conventions`, and a new verify step adapted from Spec Kit's
   `/speckit.analyze`. Pocket Comms gives them to every agent through the global skills folder,
   as it does `comms-attach-pull-request` today, and the first prompt points to the flight rules.
   Agents still start in the planet's worktree.
4. **Grilling approves a feature.** The owner's confirmation of the grilling summary approves the
   spec and plan that follow. The verify step replaces the human check: after `tasks.md` the
   agent checks spec, plan, tasks and the rules for coverage gaps, contradictions, ambiguity and
   rule violations. A CRITICAL or HIGH finding is fixed and checked again, at most twice; after
   that the agent asks the owner. MEDIUM and LOW findings go into the pull request.
5. Two **lanes**: **full flight** (grilling, spec, plan, tasks, verify, implement, pull request,
   merge, deploy) and **hop** (implement, pull request, merge, deploy). Schema changes, secrets,
   destructive actions and a failed gate still stop for the owner. A release needs no owner
   approval once the planet's preflight has a deploy recipe, a health check and a rollback.

The owner works only from Pocket Comms, and every pocket repository is meant to be a planet, so
the strong coupling is accepted in exchange for one workflow with one source.

## Consequences

- **Positive:** one place to change how agents work; no drifting copies; the owner's only
  approval is the grilling, where their effort already goes; missions can run to production.
- **Negative / trade-offs:** every planet depends on Pocket Comms for its process; an agent
  started outside Pocket Comms without the global skills has no process rules; a feature reaches
  production without a human reading its spec, so the verify step, CI and code review carry the
  weight the approval did.
- **Follow-ups:**
  - Amend the pocket-factory constitution (principles 4 and 8, and the split), then take the
    cut up in every planet, this repository first.
  - Write the flight rules and move the process skills and `.specify/templates/` into Pocket
    Comms; add the verify step.
  - Point each planet's `AGENTS.md` to the flight rules and skills; remove its copies.
  - Planets and preflight, missions and autonomous deploy follow as their own specs (see
    [Mission Control](../../mission-control.md)).
