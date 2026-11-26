---
name: flight-rules
description: The flight rules every agent that Pocket Comms starts works by, on every planet. Load them before any task, then follow the lane they name. They say when the owner must be asked and when you go on alone.
---

# Flight rules

How agents work on every planet (ADR 0016 of pocket-comms). The planet's own rules sit on top:
its constitution (`.specify/memory/constitution.md`, when it has one) and its nearest `AGENTS.md`
say how code is built there. A planet may make a flight rule stricter, never looser. Where the
two disagree, the stricter rule wins; where you cannot tell, ask the owner.

## 1. Pick the lane

Every piece of work flies one of two lanes.

| Lane            | For                                                          | Skills, in order                                                                                                       |
| --------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| **Full flight** | A feature, new behaviour, or an architecture change          | `flight-grill` → `flight-spec` → `flight-plan` → `flight-tasks` → `flight-verify` → `flight-implement` → `flight-ship` |
| **Hop**         | A fix, refactor, docs change, dependency bump or small tweak | `flight-implement` (one task: the change itself) → `flight-ship`                                                       |

The lane comes from, in this order: the issue's label (`mission:full-flight` or `mission:hop`),
the first prompt, or the kind of change. When it is unclear, ask the owner which lane.

## 2. The owner's grilling is the approval

In a full flight, the owner's confirmation of the grilling summary approves the spec, the plan
and any ADR the grilling settled. Nobody approves them again: `flight-verify` checks the spec,
plan and tasks against each other and the rules, and then you go on alone, through merge and,
where the planet allows it, deploy.

## 3. When you stop for the owner

Ask the owner (section 5) and wait, whatever the lane, before:

- a database schema change or migration;
- anything that touches secrets or credentials;
- a destructive or irreversible action: deleting data, force-pushing, rewriting shared history,
  deleting someone else's branch, a release outside the planet's deploy recipe;
- an architecture decision the grilling did not settle;
- going on after `flight-verify` still finds a CRITICAL or HIGH issue after two rounds of fixes;
- going on after a gate is still red after three attempts to fix it;
- a deploy, when the planet's `AGENTS.md` names no deploy recipe with a health check and a
  rollback.

Everything else you decide yourself and say what you decided in the pull request.

## 4. Always

1. **CI is the referee, not trust.** Do not claim something works; the gates prove it.
2. **Small, tested, shippable changes.** Test first; the default branch stays releasable.
3. **Never bypass a guardrail.** Layer boundaries, contracts, gates and these rules are not
   suggestions. No `--no-verify`, no disabled checks, no casts to silence the compiler.
4. **Proper solutions over workarounds.** No bypass flags, special cases or escape hatches. If the
   clean way is blocked, stop and ask. An accepted deviation is the owner's decision, written in
   an ADR or a spec note with its reason.
5. **English** for every repository artifact, in the words of the planet's glossary when it has
   one, never its _Avoid_ words.

## 5. How to ask the owner

Use your agent's question tool (Claude Code: `AskUserQuestion`), one decision per question, your
recommendation first. Pocket Comms shows the question on the owner's phone and sends a
notification. If your agent has no question tool, ask in plain text and wait. On a mission, also
post the question as a comment on its issue.
