---
name: speckit-implement
description: Implement one task from tasks.md test-first, with a per-task code review and the repository gates.
---

# speckit-implement — Implement one task

Implement one task from `specs/NNN-slug/tasks.md`.

## Rules

- Read `.specify/memory/constitution.md` before writing code.
- Work on a branch, never `master`.
- Follow RED → GREEN → REFACTOR with the
  [`test-driven-development`](../../test-driven-development/SKILL.md) skill.
- Respect layer boundaries; no `any`, no casts to silence the compiler, no workarounds.
- Tick the task's checkbox (`- [x]`) in the task's own commit.
- Before committing, run the [`code-review`](../../code-review/SKILL.md) skill on the task diff,
  ideally in a separate agent on a different model. Fix every `blocking` finding test-first,
  record every `follow-up` as a new task, answer every `question`. Escalate anything that needs a
  design decision.
- Name commits and pull requests with the
  [`git-and-pr-conventions`](../../git-and-pr-conventions/SKILL.md) skill.

## Steps

1. Write the failing test and see it fail for the expected reason.
2. Write the smallest change that passes.
3. Run the affected build, typecheck, lint, tests and boundary checks.
4. Refactor while green.
5. Run `code-review` on the diff and act on its findings.
6. Commit, with the checkbox ticked.

After the last task: `pnpm verify:local`, open the pull request, set the spec status to `Done`
in it, and merge once CI is green.
