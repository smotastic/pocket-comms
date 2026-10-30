---
name: speckit-specify
description: Write a feature specification (spec.md) before planning. Use for features and new behaviour; fixes, refactors, docs and chores need no spec.
---

# speckit-specify — Write a feature spec

Write `specs/NNN-slug/spec.md` for a feature.

## Rules

- Read `.specify/memory/constitution.md` and the nearest `AGENTS.md` first.
- Check the change needs a spec at all (see [`specs/README.md`](../../../../specs/README.md)). If it
  is a fix, refactor, docs change or chore, skip the spec workflow.
- Define WHAT and WHY, never HOW.
- Take the next global id: the highest `specs/NNN-*` plus 1, zero-padded to 3 digits.
- Copy `.specify/templates/spec-template.md` by hand; there is no generator.
- Write no implementation code until the human owner approves spec and plan.
- Name branches, commits and pull requests with the
  [`git-and-pr-conventions`](../../git-and-pr-conventions/SKILL.md) skill.

## Steps

1. Ask the human owner for the intent.
2. Ask targeted questions about every load-bearing unknown (scope, edge cases, errors, non-goals).
3. Fold the answers into `spec.md`; leave no open-questions list behind.
4. Continue with `speckit-plan`. Spec and plan are approved together.
