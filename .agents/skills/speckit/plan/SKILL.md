---
name: speckit-plan
description: Write the technical plan (plan.md) for a feature spec, then request the single human approval of spec and plan.
---

# speckit-plan — Write a technical plan

Write `plan.md` next to a finished `spec.md`.

## Rules

- Define HOW: affected projects and their Nx tags, contract changes, migrations, test strategy and
  risks. Use `.specify/templates/plan-template.md`.
- Respect the layer boundaries (ADR 0003) and the shapes of the comms service (`packages/comms/`).
- An architecture decision the plan depends on needs an ADR; propose it alongside the plan.
- Name branches, commits and pull requests with the
  [`git-and-pr-conventions`](../../git-and-pr-conventions/SKILL.md) skill.

## Steps

1. Read `spec.md` and the nearest `AGENTS.md`.
2. Identify affected projects, contracts and migrations.
3. Define the tests and gates that prove the spec.
4. Save `plan.md` and present spec and plan to the human owner. **Human gate:** wait for approval
   before `speckit-tasks`; on approval set both status lines to `Approved`.
