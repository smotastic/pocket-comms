# ADR 0017 — Take up the flight-rules cut of the template

- **Status:** Accepted
- **Date:** 2026-11-26
- **Related:** constitution 3.0.0; ADR 0001, ADR 0016; pocket-factory ADR 0018

## TL;DR

This repository takes up pocket-factory's cut (its pull request #132 and ADR 0018): the process
leaves the constitution and the repository's skills, and the flight rules and `flight-*` skills
in `apps/comms-server/skills` take its place, as ADR 0016 decided.

## Context

ADR 0016 moved the process to Pocket Comms and shipped the flight skills to every agent. Until
now this repository still carried its own copy of the process: constitution principles 4, 5 and
7 to 10, the `grill-me`, `git-and-pr-conventions` and Spec Kit skills and the spec, plan and tasks
templates. Two copies of the process disagree as soon as one changes.

## Decision

We will take up the template's cut, as every planet does:

- The constitution becomes 3.0.0 with the engineering principles only: hexagonal layers, no logic
  in the database, contracts first, deterministic before generative (now principle 4, following
  the comms service's shapes and the flight skills' templates).
- `grill-me`, `git-and-pr-conventions`, the Spec Kit skills `specify`, `plan`, `tasks` and
  `implement` and `.specify/templates/` are removed. `speckit-constitution`, `code-review`,
  `effect` and `test-driven-development` stay.
- `AGENTS.md`, the docs and the remaining skills point to the flight rules.

This amends ADR 0001: the process part of the adopted ruleset now comes from the flight rules.

## Consequences

- **Positive:** one copy of the process, in the same repository that ships it.
- **Negative / trade-offs:** an agent here without the linked flight skills has no process rules;
  the skills reach it only with a deploy.
- **Follow-ups:** none here; the other planets take up the cut on their own.
